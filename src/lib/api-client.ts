import type {
  DocumentDetail,
  DocumentListResponse,
  DocumentVersionSummary,
  PublicUser,
} from "./api-types";
import type { ShareRole } from "./permissions";

/** Thrown for any non-2xx API response so UI code can branch on `code`. */
export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      error?.code ?? "server_error",
      error?.message ?? "Request failed. Please try again.",
      response.status,
      error?.details,
    );
  }
  return payload as T;
}

export const api = {
  me: () => request<{ user: PublicUser | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: PublicUser }>("/api/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  listDocuments: () => request<DocumentListResponse>("/api/documents"),
  createDocument: (title?: string) =>
    request<{ document: DocumentDetail }>("/api/documents", {
      method: "POST",
      json: { title },
    }),
  getDocument: (id: string) => request<{ document: DocumentDetail }>(`/api/documents/${id}`),
  updateDocument: (
    id: string,
    body: { title?: string; contentHtml?: string; baseUpdatedAt?: string },
  ) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}`, {
      method: "PATCH",
      json: body,
    }),
  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: "DELETE" }),

  importNewDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ document: DocumentDetail; warnings: string[] }>(
      "/api/documents/import",
      { method: "POST", body: form },
    );
  },
  importIntoDocument: (id: string, file: File, mode: "append" | "replace") => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    return request<{ document: DocumentDetail; warnings: string[] }>(
      `/api/documents/${id}/import`,
      { method: "POST", body: form },
    );
  },

  listUsers: () => request<{ users: PublicUser[] }>("/api/users"),
  shareDocument: (id: string, email: string, role: ShareRole) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}/shares`, {
      method: "POST",
      json: { email, role },
    }),
  updateShare: (id: string, userId: string, role: ShareRole) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}/shares`, {
      method: "PATCH",
      json: { userId, role },
    }),
  removeShare: (id: string, userId: string) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}/shares`, {
      method: "DELETE",
      json: { userId },
    }),

  listVersions: (id: string) =>
    request<{ versions: DocumentVersionSummary[] }>(`/api/documents/${id}/versions`),
  restoreVersion: (id: string, versionId: string) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}/versions`, {
      method: "POST",
      json: { versionId },
    }),
};
