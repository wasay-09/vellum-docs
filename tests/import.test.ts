import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  convertUpload,
  extensionOf,
  markdownToHtml,
  plainTextToHtml,
  titleFromFilename,
} from "@/lib/import";
import { sanitizeDocumentHtml } from "@/lib/content";

const fixture = (name: string) => path.join(process.cwd(), "tests/fixtures", name);

async function upload(name: string) {
  const buffer = await readFile(fixture(name));
  return convertUpload({
    filename: name,
    size: buffer.byteLength,
    buffer: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  });
}

describe("file import", () => {
  it("converts a real .docx into headings and emphasis", async () => {
    const result = await upload("sample.docx");
    expect(result.html).toContain("<h1>Quarterly Planning Notes</h1>");
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain("<em>italic</em>");
    expect(result.html).toContain("<h2>Next steps</h2>");
    // The first heading becomes the document title, not the filename.
    expect(result.suggestedTitle).toBe("Quarterly Planning Notes");
  });

  it("converts markdown structure and strips embedded scripts", async () => {
    const result = await upload("sample.md");
    expect(result.html).toContain("<h1>Launch checklist</h1>");
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("<ol>");
    expect(result.html).toContain("<strong>Friday</strong>");
    expect(result.html).toContain("<blockquote>");
    expect(result.html).not.toContain("script");
    expect(result.suggestedTitle).toBe("Launch checklist");
  });

  it("converts plain text into paragraphs and escapes markup", async () => {
    const result = await upload("sample.txt");
    expect(result.html).toContain("<p>Meeting notes</p>");
    // `<b>` in a .txt file is literal text, never markup.
    expect(result.html).toContain("&lt;b&gt;");
    expect(result.html).not.toContain("<b>");
    expect(result.suggestedTitle).toBe("Sample");
  });

  it("rejects unsupported file types with a helpful message", async () => {
    await expect(
      convertUpload({
        filename: "contract.pdf",
        size: 100,
        buffer: new ArrayBuffer(100),
      }),
    ).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("rejects files above the size limit", async () => {
    await expect(
      convertUpload({
        filename: "huge.md",
        size: 5_000_000,
        buffer: new ArrayBuffer(8),
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("rejects a file with no readable text", async () => {
    await expect(
      convertUpload({
        filename: "blank.txt",
        size: 3,
        buffer: new TextEncoder().encode("\n\n\n").buffer as ArrayBuffer,
      }),
    ).rejects.toMatchObject({ code: "empty" });
  });

  it("rejects a corrupt .docx instead of failing opaquely", async () => {
    await expect(
      convertUpload({
        filename: "broken.docx",
        size: 12,
        buffer: new TextEncoder().encode("not really a zip").buffer as ArrayBuffer,
      }),
    ).rejects.toMatchObject({ code: "corrupt" });
  });
});

describe("import helpers", () => {
  it("reads extensions case-insensitively", () => {
    expect(extensionOf("Report.DOCX")).toBe(".docx");
    expect(extensionOf("no-extension")).toBe("");
  });

  it("humanises filenames into titles", () => {
    expect(titleFromFilename("q3_planning-notes.md")).toBe("Q3 planning notes");
  });

  it("keeps markdown line breaks out of paragraph text", () => {
    expect(plainTextToHtml("a\nb\n\nc")).toBe("<p>a<br />b</p><p>c</p>");
  });

  it("produces sanitiser-stable markdown output", () => {
    const html = markdownToHtml("# Hi\n\nsome *text*");
    expect(sanitizeDocumentHtml(html)).toBe(sanitizeDocumentHtml(sanitizeDocumentHtml(html)));
  });
});
