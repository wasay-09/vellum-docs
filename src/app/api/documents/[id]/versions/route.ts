import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  assertCan,
  listVersions,
  loadDocumentForUser,
  restoreVersion,
} from "@/db/queries";
import { badRequest, withErrorHandling } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const db = await getDb();
  const { detail } = await loadDocumentForUser(db, id, user);
  assertCan(detail.access.canViewHistory, "You cannot view this document's history.");
  return NextResponse.json({ versions: await listVersions(db, id) });
});

/** Restore a snapshot. The pre-restore state is snapshotted first, so it is undoable. */
export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const parsed = z
    .object({ versionId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid version.", parsed.error.flatten());

  const db = await getDb();
  const { doc, detail } = await loadDocumentForUser(db, id, user);
  assertCan(
    detail.access.canRestoreVersion,
    "You have view-only access to this document.",
  );

  await restoreVersion(db, {
    doc,
    versionId: parsed.data.versionId,
    actorId: user.id,
  });

  const { detail: updated } = await loadDocumentForUser(db, id, user);
  return NextResponse.json({ document: updated });
});
