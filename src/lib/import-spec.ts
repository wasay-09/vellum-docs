/**
 * Client-safe half of the import feature: the supported types, the size limit and the
 * filename helpers. Kept separate from `import.ts` so the browser bundle never pulls in
 * the converters (mammoth, marked) or the sanitiser just to render a file picker.
 */

export const MAX_UPLOAD_BYTES = 2_000_000; // 2 MB

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

export function extensionOf(filename: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filename.trim());
  return match ? match[0].toLowerCase() : "";
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "Imported document";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function isSupportedImport(filename: string): boolean {
  return SUPPORTED_IMPORT_EXTENSIONS.includes(extensionOf(filename) as never);
}

/** Shared client/server pre-flight so both sides reject the same files. */
export function describeUploadProblem(file: {
  name: string;
  size: number;
}): string | null {
  if (!isSupportedImport(file.name)) {
    return `Vellum can import ${SUPPORTED_IMPORT_TYPES.map((type) => type.label).join(", ")}. “${file.name}” is not one of those.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name}” is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1_000_000} MB.`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  return null;
}
