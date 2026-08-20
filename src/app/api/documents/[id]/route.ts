import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  assertCan,
  deleteDocument,
  loadDocumentForUser,
  updateDocument,
} from "@/db/queries";
import { ApiError, badRequest, withErrorHandling } from "@/lib/errors";
import {
  MAX_CONTENT_BYTES,
  byteLength,
  sanitizeDocumentHtml,
} from "@/lib/content";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const db = await getDb();
  const { detail } = await loadDocumentForUser(db, id, user);
  return NextResponse.json({ document: detail });
});

const patchSchema = z
  .object({
    title: z.string().max(300).optional(),
    contentHtml: z.string().optional(),
    baseUpdatedAt: z.string().optional().nullable(),
  })
  .refine(
    (value) => value.title !== undefined || value.contentHtml !== undefined,
    { message: "Nothing to update." },
  );

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest("Invalid document update.", parsed.error.flatten());
  }

  const db = await getDb();
  const { doc, detail } = await loadDocumentForUser(db, id, user);

  if (parsed.data.contentHtml !== undefined) {
    assertCan(detail.access.canEdit, "You have view-only access to this document.");
    if (byteLength(parsed.data.contentHtml) > MAX_CONTENT_BYTES) {
      throw new ApiError(
        "payload_too_large",
        `This document is too large to save (limit ${Math.round(MAX_CONTENT_BYTES / 1000)} KB of HTML).`,
      );
    }
  }
  if (parsed.data.title !== undefined) {
    assertCan(detail.access.canRename, "You cannot rename this document.");
  }

  await updateDocument(db, {
    doc,
    actorId: user.id,
    title: parsed.data.title,
    // Sanitised on the way in: the editor is a browser, so its HTML is untrusted.
    contentHtml:
      parsed.data.contentHtml === undefined
        ? undefined
        : sanitizeDocumentHtml(parsed.data.contentHtml),
    baseUpdatedAt: parsed.data.baseUpdatedAt ?? null,
  });

  const { detail: updated } = await loadDocumentForUser(db, id, user);
  return NextResponse.json({ document: updated });
});

export const DELETE = withErrorHandling(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const db = await getDb();
  const { detail } = await loadDocumentForUser(db, id, user);
  assertCan(detail.access.canDelete, "Only the owner can delete this document.");
  await deleteDocument(db, id);
  return new NextResponse(null, { status: 204 });
});
