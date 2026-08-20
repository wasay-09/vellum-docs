import { describe, expect, it } from "vitest";
import {
  excerptFromHtml,
  isMeaningfulChange,
  normaliseTitle,
  sanitizeDocumentHtml,
  wordCountFromHtml,
} from "@/lib/content";

describe("sanitizeDocumentHtml", () => {
  it("keeps the formatting the editor can produce", () => {
    const html =
      "<h1>Title</h1><h2>Sub</h2><p><strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code></p>" +
      "<ul><li>one</li></ul><ol><li>two</li></ol><blockquote><p>quote</p></blockquote><hr />";
    expect(sanitizeDocumentHtml(html)).toBe(html.replace("<hr />", "<hr />"));
  });

  it("strips script tags and their contents", () => {
    const clean = sanitizeDocumentHtml("<p>ok</p><script>alert('xss')</script>");
    expect(clean).toBe("<p>ok</p>");
    expect(clean).not.toContain("alert");
  });

  it("strips event handlers and javascript: URLs", () => {
    const clean = sanitizeDocumentHtml(
      '<p onclick="steal()">hi</p><a href="javascript:alert(1)">click</a><img src=x onerror=alert(1) />',
    );
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("onerror");
    expect(clean).toContain("hi");
  });

  it("normalises legacy tags into the editor's schema", () => {
    expect(sanitizeDocumentHtml("<b>bold</b>")).toBe("<strong>bold</strong>");
    expect(sanitizeDocumentHtml("<i>it</i>")).toBe("<em>it</em>");
    expect(sanitizeDocumentHtml("<h5>deep</h5>")).toBe("<h3>deep</h3>");
    expect(sanitizeDocumentHtml("<div>block</div>")).toBe("<p>block</p>");
  });

  it("hardens external links", () => {
    const clean = sanitizeDocumentHtml('<a href="https://ajaia.com">x</a>');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it("drops iframes, styles and forms outright", () => {
    const clean = sanitizeDocumentHtml(
      '<iframe src="https://evil.test"></iframe><style>body{display:none}</style><form><input /></form><p>safe</p>',
    );
    expect(clean).toBe("<p>safe</p>");
  });
});

describe("derived fields", () => {
  it("builds a plain-text excerpt and truncates with an ellipsis", () => {
    expect(excerptFromHtml("<p>Hello</p><p>World</p>")).toBe("Hello World");
    expect(excerptFromHtml(`<p>${"word ".repeat(100)}</p>`, 20)).toHaveLength(20);
  });

  it("skips a leading heading so the preview is not the title twice", () => {
    expect(excerptFromHtml("<h1>Launch plan</h1><p>Ship on Friday.</p>")).toBe(
      "Ship on Friday.",
    );
    // ...unless the heading is all there is.
    expect(excerptFromHtml("<h1>Launch plan</h1>")).toBe("Launch plan");
  });

  it("counts words, not tags", () => {
    expect(wordCountFromHtml("<p>one two three</p>")).toBe(3);
    expect(wordCountFromHtml("<p></p>")).toBe(0);
  });

  it("treats whitespace-only differences as no change", () => {
    expect(isMeaningfulChange("<p>a</p>", "<p>a</p>\n")).toBe(false);
    expect(isMeaningfulChange("<p>a</p>", "<p>b</p>")).toBe(true);
  });

  it("falls back to a default title", () => {
    expect(normaliseTitle("   ")).toBe("Untitled document");
    expect(normaliseTitle("  Spaced   out  ")).toBe("Spaced out");
  });
});
