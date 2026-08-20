import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "server_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  server_error: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError("invalid_request", message, details);
export const unauthorized = (message = "Sign in to continue.") =>
  new ApiError("unauthorized", message);
/** Deliberately 404, not 403: never leak that a document exists. */
export const notFound = (message = "Document not found.") =>
  new ApiError("not_found", message);
export const forbidden = (message: string) => new ApiError("forbidden", message);
export const conflict = (message: string, details?: unknown) =>
  new ApiError("conflict", message, details);

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json(
    {
      error: {
        code: "server_error" satisfies ApiErrorCode,
        message: "Something went wrong on our side.",
      },
    },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown ApiErrors become clean JSON responses. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
