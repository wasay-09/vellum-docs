import "server-only";

import { ApiError, badRequest } from "./errors";
import { MAX_UPLOAD_BYTES } from "./content";
import { ImportError, convertUpload, type ImportResult } from "./import";

/**
 * Shared multipart handling for both import endpoints: pull the file out of the
 * form, convert it, and translate converter failures into HTTP-shaped errors.
 */
export async function readUpload(
  request: Request,
): Promise<{ result: ImportResult; mode: "append" | "replace" }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Expected a multipart form upload with a `file` field.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest("Choose a file to import.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      "payload_too_large",
      `File is too large. Limit is ${MAX_UPLOAD_BYTES / 1_000_000} MB.`,
    );
  }

  const rawMode = form.get("mode");
  const mode = rawMode === "replace" ? "replace" : "append";

  try {
    const result = await convertUpload({
      filename: file.name,
      size: file.size,
      buffer: await file.arrayBuffer(),
    });
    return { result, mode };
  } catch (error) {
    if (error instanceof ImportError) {
      if (error.code === "unsupported_type") {
        throw new ApiError("unsupported_media_type", error.message);
      }
      if (error.code === "too_large") {
        throw new ApiError("payload_too_large", error.message);
      }
      throw badRequest(error.message);
    }
    throw error;
  }
}
