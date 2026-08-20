import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { assertCan, loadDocumentForUser, updateDocument } from "@/db/queries";
import { withErrorHandling } from "@/lib/errors";
import { readUpload } from "@/lib/upload";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Import a file into an existing draft, either appended or replacing the body. */
export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const db = await getDb();
  const { doc, detail } = await loadDocumentForUser(db, id, user);
  assertCan(detail.access.canImport, "You have view-only access to this document.");

  const { result, mode } = await readUpload(request);
  const nextHtml =
    mode === "replace" || !doc.contentHtml.trim()
      ? result.html
      : `${doc.contentHtml}${result.html}`;

  await updateDocument(db, {
    doc,
    actorId: user.id,
    contentHtml: nextHtml,
    reason: "import",
  });

  const { detail: updated } = await loadDocumentForUser(db, id, user);
  return NextResponse.json({ document: updated, warnings: result.warnings });
});
