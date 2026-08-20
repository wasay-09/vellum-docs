import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { loadDocumentForUser } from "@/db/queries";
import { badRequest, withErrorHandling } from "@/lib/errors";
import { htmlToMarkdown, htmlToTxt, safeFilename } from "@/lib/export";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const FORMATS = {
  md: { extension: "md", contentType: "text/markdown; charset=utf-8" },
  txt: { extension: "txt", contentType: "text/plain; charset=utf-8" },
  html: { extension: "html", contentType: "text/html; charset=utf-8" },
} as const;

type Format = keyof typeof FORMATS;

function standaloneHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title.replace(/</g, "&lt;")}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.7; max-width: 720px; margin: 3rem auto; padding: 0 1.25rem; color: #10131a; }
  blockquote { border-left: 3px solid #cfd4e0; margin-left: 0; padding-left: 1rem; color: #5c6577; }
  pre { background: #10131a; color: #f5f6fa; padding: 1rem; border-radius: .5rem; overflow-x: auto; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>${title.replace(/</g, "&lt;")}</h1>
${body}
</body>
</html>`;
}

/** Anyone who can view a document can export it (viewers included). */
export const GET = withErrorHandling(async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const format = (new URL(request.url).searchParams.get("format") ?? "md") as Format;
  if (!(format in FORMATS)) {
    throw badRequest(`Unsupported export format. Use one of: ${Object.keys(FORMATS).join(", ")}.`);
  }

  const db = await getDb();
  const { detail } = await loadDocumentForUser(db, id, user);

  const body =
    format === "md"
      ? htmlToMarkdown(detail.contentHtml, detail.title)
      : format === "txt"
        ? `${detail.title}\n\n${htmlToTxt(detail.contentHtml)}`
        : standaloneHtml(detail.title, detail.contentHtml);

  return new NextResponse(body, {
    headers: {
      "content-type": FORMATS[format].contentType,
      "content-disposition": `attachment; filename="${safeFilename(detail.title, FORMATS[format].extension)}"`,
      "cache-control": "no-store",
    },
  });
});
