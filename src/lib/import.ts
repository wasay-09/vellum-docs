import { marked } from "marked";
import { MAX_UPLOAD_BYTES, sanitizeDocumentHtml } from "./content";

/**
 * File import. Conversion happens on the server so the browser never has to trust
 * (or bundle) a docx parser, and so every imported byte passes the same sanitiser
 * as editor input.
 */

export const SUPPORTED_IMPORT_TYPES = [
  { extension: ".docx", label: "Word (.docx)" },
  { extension: ".md", label: "Markdown (.md)" },
  { extension: ".markdown", label: "Markdown (.markdown)" },
  { extension: ".txt", label: "Plain text (.txt)" },
] as const;

export const SUPPORTED_IMPORT_EXTENSIONS = SUPPORTED_IMPORT_TYPES.map(
  (type) => type.extension,
);

export const SUPPORTED_IMPORT_ACCEPT = SUPPORTED_IMPORT_EXTENSIONS.join(",");

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported_type" | "too_large" | "empty" | "corrupt",
  ) {
    super(message);
  }
}

export interface ImportResult {
  /** Sanitised HTML ready to persist. */
  html: string;
  /** Title derived from the file name (or the first heading for markdown/docx). */
  suggestedTitle: string;
  warnings: string[];
}

export function extensionOf(filename: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filename.trim());
  return match ? match[0].toLowerCase() : "";
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "Imported document";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function plainTextToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
}

/** Pulls a better title out of the converted HTML when the file starts with a heading. */
export function titleFromHtml(html: string, fallback: string): string {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!match) return fallback;
  const text = match[1].replace(/<[^>]*>/g, "").trim();
  return text || fallback;
}

export async function convertUpload(input: {
  filename: string;
  size: number;
  buffer: ArrayBuffer;
}): Promise<ImportResult> {
  const extension = extensionOf(input.filename);
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as never)) {
    throw new ImportError(
      `Unsupported file type "${extension || input.filename}". Supported: ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")}.`,
      "unsupported_type",
    );
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new ImportError(
      `File is too large (${(input.size / 1_000_000).toFixed(1)} MB). Limit is ${MAX_UPLOAD_BYTES / 1_000_000} MB.`,
      "too_large",
    );
  }

  const warnings: string[] = [];
  let html: string;

  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    try {
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(input.buffer) });
      html = result.value;
      for (const message of result.messages.slice(0, 3)) {
        if (message.type === "warning") warnings.push(message.message);
      }
    } catch {
      throw new ImportError(
        "That .docx file could not be read. It may be corrupt or password protected.",
        "corrupt",
      );
    }
  } else {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.buffer);
    html = extension === ".txt" ? plainTextToHtml(text) : markdownToHtml(text);
  }

  const sanitized = sanitizeDocumentHtml(html);
  if (!sanitized || !sanitized.replace(/<[^>]*>/g, "").trim()) {
    throw new ImportError("That file has no readable text content.", "empty");
  }

  const fallbackTitle = titleFromFilename(input.filename);
  return {
    html: sanitized,
    suggestedTitle:
      extension === ".txt" ? fallbackTitle : titleFromHtml(sanitized, fallbackTitle),
    warnings,
  };
}
