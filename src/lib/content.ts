import sanitizeHtml from "sanitize-html";

/**
 * The document body is stored as HTML because it is the lingua franca between the
 * editor (TipTap), file imports (mammoth/marked) and exports (turndown). HTML from a
 * browser can never be trusted, so every write path funnels through
 * `sanitizeDocumentHtml`, whose allow-list mirrors the editor schema exactly.
 */

export const MAX_CONTENT_BYTES = 400_000; // ~400 KB of HTML, comfortably long docs.
export const MAX_TITLE_LENGTH = 200;
export { MAX_UPLOAD_BYTES } from "./import-spec";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "a",
];

export function sanitizeDocumentHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Anything richer than the editor supports is folded into the nearest
    // supported node instead of being dropped, so imports keep their structure.
    transformTags: {
      b: "strong",
      i: "em",
      ins: "u",
      strike: "s",
      del: "s",
      h4: "h3",
      h5: "h3",
      h6: "h3",
      div: "p",
      section: "p",
      article: "p",
      a: (tagName, attribs) => ({
        tagName,
        attribs: attribs.href
          ? { href: attribs.href, target: "_blank", rel: "noopener noreferrer" }
          : ({} as Record<string, string>),
      }),
    },
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
  }).trim();
}

/** Block boundaries become spaces, otherwise `<p>a</p><p>b</p>` reads as "ab" and
 * both the excerpt and the word count are wrong. */
const BLOCK_END_RE = /<\/(p|h[1-6]|li|blockquote|pre|div|ul|ol|tr|section|article)>/gi;
const BREAK_RE = /<br\s*\/?>/gi;

export function htmlToPlainText(html: string): string {
  const spaced = html.replace(BLOCK_END_RE, " $& ").replace(BREAK_RE, " ");
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromHtml(html: string, length = 220): string {
  // Documents usually open with a heading that repeats the title, and repeating it in
  // the dashboard preview wastes the only three lines we get. Drop a leading heading
  // when there is body text after it.
  const withoutLeadHeading = html.replace(/^\s*<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/i, "");
  const body = htmlToPlainText(withoutLeadHeading);
  const text = body || htmlToPlainText(html);
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

export function wordCountFromHtml(html: string): number {
  const text = htmlToPlainText(html);
  return text ? text.split(/\s+/).length : 0;
}

/** True when the two documents differ by more than whitespace. */
export function isMeaningfulChange(previousHtml: string, nextHtml: string): boolean {
  return previousHtml.replace(/\s+/g, " ").trim() !== nextHtml.replace(/\s+/g, " ").trim();
}

export function normaliseTitle(input: string | undefined | null): string {
  const title = (input ?? "").replace(/\s+/g, " ").trim();
  if (!title) return "Untitled document";
  return title.slice(0, MAX_TITLE_LENGTH);
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
