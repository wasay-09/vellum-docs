import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createDocument, listDocumentsForUser, loadDocumentForUser } from "@/db/queries";
import { badRequest, withErrorHandling } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const db = await getDb();
  return NextResponse.json(await listDocumentsForUser(db, user.id));
});

const createSchema = z.object({
  title: z.string().max(300).optional().nullable(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser();
  const raw = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw ?? {});
  if (!parsed.success) throw badRequest("Invalid title.", parsed.error.flatten());

  const db = await getDb();
  const created = await createDocument(db, {
    ownerId: user.id,
    title: parsed.data.title ?? undefined,
  });
  const { detail } = await loadDocumentForUser(db, created.id, user);
  return NextResponse.json({ document: detail }, { status: 201 });
});
