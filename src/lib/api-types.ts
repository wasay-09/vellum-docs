import type { AccessRole, DocumentAccess, ShareRole } from "./permissions";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  accent: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  excerpt: string;
  wordCount: number;
  updatedAt: string;
  createdAt: string;
  owner: PublicUser;
  lastEditedBy: PublicUser | null;
  /** How the current user reaches this document. */
  role: AccessRole;
  /** Only present for documents the current user owns. */
  sharedWith: { user: PublicUser; role: ShareRole }[];
}

export interface DocumentDetail extends DocumentSummary {
  contentHtml: string;
  access: DocumentAccess;
}

export interface DocumentVersionSummary {
  id: string;
  title: string;
  wordCount: number;
  reason: string;
  createdAt: string;
  author: PublicUser | null;
}

export interface DocumentListResponse {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
