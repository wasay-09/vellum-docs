import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { createDocument, loadDocumentForUser } from "@/db/queries";
import { withErrorHandling } from "@/lib/errors";
import { readUpload } from "@/lib/upload";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload a .docx/.md/.txt file and get back a new, editable document. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser();
  const { result } = await readUpload(request);
  const db = await getDb();
  const created = await createDocument(db, {
    ownerId: user.id,
    title: result.suggestedTitle,
    contentHtml: result.html,
  });
  const { detail } = await loadDocumentForUser(db, created.id, user);
  return NextResponse.json(
    { document: detail, warnings: result.warnings },
    { status: 201 },
  );
});
