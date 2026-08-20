import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  assertCan,
  findUserByEmail,
  loadDocumentForUser,
  removeShare,
  upsertShare,
} from "@/db/queries";
import { badRequest, notFound, withErrorHandling } from "@/lib/errors";
import { validateShareTarget } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const roleSchema = z.enum(["viewer", "editor"]);

/** Grant access by email. Only the owner can share (see resolveAccess). */
export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  const { id } = await context.params;
  const parsed = z
    .object({ email: z.string().trim().min(3).max(200), role: roleSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest("Enter an email address and a role.", parsed.error.flatten());
  }

  const db = await getDb();
  const { doc, detail } = await loadDocumentForUser(db, id, actor);
  assertCan(detail.access.canShare, "Only the owner can share this document.");

  const target = await findUserByEmail(db, parsed.data.email);
  if (!target) {
    throw badRequest(
      "No account with that email. Sharing works between the seeded demo accounts.",
    );
  }

  const check = validateShareTarget({
    ownerId: doc.ownerId,
    actorId: actor.id,
    targetUserId: target.id,
  });
  if (!check.ok) throw badRequest(check.reason);

  await upsertShare(db, {
    documentId: doc.id,
    userId: target.id,
    role: parsed.data.role,
    createdById: actor.id,
  });

  const { detail: updated } = await loadDocumentForUser(db, id, actor);
  return NextResponse.json({ document: updated }, { status: 201 });
});

/** Change an existing collaborator's role. */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  const { id } = await context.params;
  const parsed = z
    .object({ userId: z.string().uuid(), role: roleSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid share update.", parsed.error.flatten());

  const db = await getDb();
  const { doc, detail, shares } = await loadDocumentForUser(db, id, actor);
  assertCan(detail.access.canShare, "Only the owner can change access.");
  if (!shares.some((share) => share.userId === parsed.data.userId)) {
    throw notFound("That person does not have access to this document.");
  }

  await upsertShare(db, {
    documentId: doc.id,
    userId: parsed.data.userId,
    role: parsed.data.role,
    createdById: actor.id,
  });

  const { detail: updated } = await loadDocumentForUser(db, id, actor);
  return NextResponse.json({ document: updated });
});

/** Revoke access. */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  const { id } = await context.params;
  const parsed = z
    .object({ userId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid request.", parsed.error.flatten());

  const db = await getDb();
  const { doc, detail } = await loadDocumentForUser(db, id, actor);
  assertCan(detail.access.canShare, "Only the owner can change access.");

  await removeShare(db, { documentId: doc.id, userId: parsed.data.userId });

  const { detail: updated } = await loadDocumentForUser(db, id, actor);
  return NextResponse.json({ document: updated });
});
