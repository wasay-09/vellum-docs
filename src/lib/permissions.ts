/**
 * Access control lives here as pure functions so it can be unit tested without a
 * database and reused by every route handler. There is exactly one place that
 * decides what a user may do with a document.
 */

export type ShareRole = "viewer" | "editor";
export type AccessRole = "owner" | ShareRole;

export interface DocumentAccessInput {
  ownerId: string;
  /** Shares for this document only. */
  shares: { userId: string; role: string }[];
  viewerId: string | null;
}

export interface DocumentAccess {
  role: AccessRole | null;
  canView: boolean;
  canEdit: boolean;
  canRename: boolean;
  canImport: boolean;
  canShare: boolean;
  canDelete: boolean;
  canViewHistory: boolean;
  canRestoreVersion: boolean;
}

const NO_ACCESS: DocumentAccess = {
  role: null,
  canView: false,
  canEdit: false,
  canRename: false,
  canImport: false,
  canShare: false,
  canDelete: false,
  canViewHistory: false,
  canRestoreVersion: false,
};

export function isShareRole(value: unknown): value is ShareRole {
  return value === "viewer" || value === "editor";
}

/**
 * Role model, intentionally small:
 *
 *  owner  — everything, including sharing and deleting.
 *  editor — read, write, rename, import. Cannot re-share or delete.
 *  viewer — read and export only.
 */
export function resolveAccess(input: DocumentAccessInput): DocumentAccess {
  const { ownerId, shares, viewerId } = input;
  if (!viewerId) return NO_ACCESS;

  if (viewerId === ownerId) {
    return {
      role: "owner",
      canView: true,
      canEdit: true,
      canRename: true,
      canImport: true,
      canShare: true,
      canDelete: true,
      canViewHistory: true,
      canRestoreVersion: true,
    };
  }

  const share = shares.find((candidate) => candidate.userId === viewerId);
  if (!share) return NO_ACCESS;

  if (share.role === "editor") {
    return {
      role: "editor",
      canView: true,
      canEdit: true,
      canRename: true,
      canImport: true,
      canShare: false,
      canDelete: false,
      canViewHistory: true,
      canRestoreVersion: true,
    };
  }

  if (share.role === "viewer") {
    return {
      ...NO_ACCESS,
      role: "viewer",
      canView: true,
      canViewHistory: true,
    };
  }

  // Unknown role in the database: fail closed rather than guessing.
  return NO_ACCESS;
}

/** Owners cannot be added as collaborators, and nobody may share with themselves. */
export function validateShareTarget(input: {
  ownerId: string;
  actorId: string;
  targetUserId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.targetUserId === input.ownerId) {
    return { ok: false, reason: "This person already owns the document." };
  }
  if (input.targetUserId === input.actorId) {
    return { ok: false, reason: "You already have access to this document." };
  }
  return { ok: true };
}
