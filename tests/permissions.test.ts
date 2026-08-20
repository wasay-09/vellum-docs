import { describe, expect, it } from "vitest";
import { resolveAccess, validateShareTarget } from "@/lib/permissions";

const OWNER = "11111111-1111-1111-1111-111111111111";
const EDITOR = "22222222-2222-2222-2222-222222222222";
const VIEWER = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

const shares = [
  { userId: EDITOR, role: "editor" },
  { userId: VIEWER, role: "viewer" },
];

describe("resolveAccess", () => {
  it("gives the owner every capability", () => {
    const access = resolveAccess({ ownerId: OWNER, shares, viewerId: OWNER });
    expect(access.role).toBe("owner");
    expect(access).toMatchObject({
      canView: true,
      canEdit: true,
      canRename: true,
      canImport: true,
      canShare: true,
      canDelete: true,
      canRestoreVersion: true,
    });
  });

  it("lets an editor write but never share or delete", () => {
    const access = resolveAccess({ ownerId: OWNER, shares, viewerId: EDITOR });
    expect(access.role).toBe("editor");
    expect(access.canEdit).toBe(true);
    expect(access.canImport).toBe(true);
    expect(access.canRename).toBe(true);
    expect(access.canShare).toBe(false);
    expect(access.canDelete).toBe(false);
  });

  it("limits a viewer to reading and history", () => {
    const access = resolveAccess({ ownerId: OWNER, shares, viewerId: VIEWER });
    expect(access.role).toBe("viewer");
    expect(access.canView).toBe(true);
    expect(access.canViewHistory).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canRename).toBe(false);
    expect(access.canImport).toBe(false);
    expect(access.canRestoreVersion).toBe(false);
  });

  it("denies everything to users with no share", () => {
    const access = resolveAccess({ ownerId: OWNER, shares, viewerId: STRANGER });
    expect(access.role).toBeNull();
    expect(access.canView).toBe(false);
  });

  it("denies everything when nobody is signed in", () => {
    expect(resolveAccess({ ownerId: OWNER, shares, viewerId: null }).canView).toBe(false);
  });

  it("fails closed on an unrecognised role in the database", () => {
    const access = resolveAccess({
      ownerId: OWNER,
      shares: [{ userId: STRANGER, role: "admin" }],
      viewerId: STRANGER,
    });
    expect(access.canView).toBe(false);
    expect(access.role).toBeNull();
  });
});

describe("validateShareTarget", () => {
  it("rejects sharing with the owner", () => {
    const result = validateShareTarget({
      ownerId: OWNER,
      actorId: OWNER,
      targetUserId: OWNER,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects sharing with yourself", () => {
    const result = validateShareTarget({
      ownerId: OWNER,
      actorId: EDITOR,
      targetUserId: EDITOR,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a different user", () => {
    expect(
      validateShareTarget({ ownerId: OWNER, actorId: OWNER, targetUserId: EDITOR }).ok,
    ).toBe(true);
  });
});
