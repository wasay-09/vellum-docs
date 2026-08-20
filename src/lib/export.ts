import TurndownService from "turndown";
import { htmlToPlainText } from "./content";

/** HTML -> Markdown for the export menu. Underline has no Markdown equivalent, so it
 * is preserved as an inline tag (valid in most Markdown renderers). */
function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  service.addRule("underline", {
    filter: ["u"],
    replacement: (content) => `<u>${content}</u>`,
  });
  return service;
}

export function htmlToMarkdown(html: string, title?: string): string {
  const body = createTurndown().turndown(html);
  if (!title) return body;
  const hasTitleHeading = new RegExp(`^#\\s+${escapeRegex(title)}`, "m").test(body);
  return hasTitleHeading ? body : `# ${title}\n\n${body}`;
}

export function htmlToTxt(html: string): string {
  return htmlToPlainText(html);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function safeFilename(title: string, extension: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "document";
  return `${base}.${extension}`;
}
