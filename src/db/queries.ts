import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  excerptFromHtml,
  isMeaningfulChange,
  normaliseTitle,
  wordCountFromHtml,
} from "@/lib/content";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { resolveAccess, type ShareRole } from "@/lib/permissions";
import { toPublicUser } from "@/lib/session";
import type {
  DocumentDetail,
  DocumentSummary,
  DocumentVersionSummary,
  PublicUser,
} from "@/lib/api-types";
import type { Db } from "./client";
import {
  documentShares,
  documentVersions,
  documents,
  users,
  type DocumentRow,
  type UserRow,
} from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** A snapshot is taken at most once per author per window, so autosave cannot spam. */
const VERSION_WINDOW_MS = 45_000;

function summary(
  doc: DocumentRow,
  owner: UserRow,
  lastEditedBy: UserRow | null,
  role: DocumentSummary["role"],
  sharedWith: DocumentSummary["sharedWith"],
): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    excerpt: doc.excerpt,
    wordCount: doc.wordCount,
    updatedAt: doc.updatedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    owner: toPublicUser(owner),
    lastEditedBy: lastEditedBy ? toPublicUser(lastEditedBy) : null,
    role,
    sharedWith,
  };
}

async function usersByIds(db: Db, ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listUsers(db: Db, excludeUserId?: string): Promise<PublicUser[]> {
  const rows = await db.select().from(users).orderBy(users.name);
  return rows
    .filter((row) => row.id !== excludeUserId)
    .map((row) => toPublicUser(row));
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function listDocumentsForUser(db: Db, userId: string) {
  const owned = await db
    .select()
    .from(documents)
    .where(eq(documents.ownerId, userId))
    .orderBy(desc(documents.updatedAt));

  const sharedRows = await db
    .select({ document: documents, role: documentShares.role })
    .from(documentShares)
    .innerJoin(documents, eq(documents.id, documentShares.documentId))
    .where(eq(documentShares.userId, userId))
    .orderBy(desc(documents.updatedAt));

  const allDocIds = [...owned.map((d) => d.id), ...sharedRows.map((r) => r.document.id)];
  const shares = allDocIds.length
    ? await db
        .select()
        .from(documentShares)
        .where(inArray(documentShares.documentId, allDocIds))
    : [];

  const people = await usersByIds(db, [
    ...owned.map((d) => d.ownerId),
    ...owned.map((d) => d.updatedById ?? ""),
    ...sharedRows.map((r) => r.document.ownerId),
    ...sharedRows.map((r) => r.document.updatedById ?? ""),
    ...shares.map((s) => s.userId),
    userId,
  ]);

  const collaboratorsFor = (docId: string): DocumentSummary["sharedWith"] =>
    shares
      .filter((share) => share.documentId === docId)
      .map((share) => {
        const user = people.get(share.userId);
        return user
          ? { user: toPublicUser(user), role: share.role as ShareRole }
          : null;
      })
      .filter((value): value is { user: PublicUser; role: ShareRole } => value !== null);

  return {
    owned: owned.map((doc) =>
      summary(
        doc,
        people.get(doc.ownerId)!,
        doc.updatedById ? people.get(doc.updatedById) ?? null : null,
        "owner",
        collaboratorsFor(doc.id),
      ),
    ),
    shared: sharedRows.map((row) =>
      summary(
        row.document,
        people.get(row.document.ownerId)!,
        row.document.updatedById ? people.get(row.document.updatedById) ?? null : null,
        (row.role === "editor" ? "editor" : "viewer") as ShareRole,
        [],
      ),
    ),
  };
}

interface LoadedDocument {
  doc: DocumentRow;
  owner: UserRow;
  shares: { userId: string; role: string }[];
  detail: DocumentDetail;
}

/**
 * Single entry point for "can this user touch this document". Missing access is
 * reported as `notFound` so the API never confirms the existence of other people's
 * documents.
 */
export async function loadDocumentForUser(
  db: Db,
  documentId: string,
  viewer: UserRow,
): Promise<LoadedDocument> {
  if (!isUuid(documentId)) throw notFound();

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw notFound();

  const shares = await db
    .select()
    .from(documentShares)
    .where(eq(documentShares.documentId, documentId));

  const access = resolveAccess({
    ownerId: doc.ownerId,
    shares: shares.map((share) => ({ userId: share.userId, role: share.role })),
    viewerId: viewer.id,
  });
  if (!access.canView) throw notFound();

  const people = await usersByIds(db, [
    doc.ownerId,
    doc.updatedById ?? "",
    ...shares.map((share) => share.userId),
  ]);
  const owner = people.get(doc.ownerId)!;

  const sharedWith = access.canShare
    ? shares
        .map((share) => {
          const user = people.get(share.userId);
          return user
            ? { user: toPublicUser(user), role: share.role as ShareRole }
            : null;
        })
        .filter((value): value is { user: PublicUser; role: ShareRole } => value !== null)
    : [];

  const base = summary(
    doc,
    owner,
    doc.updatedById ? people.get(doc.updatedById) ?? null : null,
    access.role!,
    sharedWith,
  );

  return {
    doc,
    owner,
    shares: shares.map((share) => ({ userId: share.userId, role: share.role })),
    detail: { ...base, contentHtml: doc.contentHtml, access },
  };
}

export async function createDocument(
  db: Db,
  input: { ownerId: string; title?: string; contentHtml?: string },
): Promise<DocumentRow> {
  const contentHtml = input.contentHtml ?? "";
  const [row] = await db
    .insert(documents)
    .values({
      ownerId: input.ownerId,
      title: normaliseTitle(input.title),
      contentHtml,
      excerpt: excerptFromHtml(contentHtml),
      wordCount: wordCountFromHtml(contentHtml),
      updatedById: input.ownerId,
    })
    .returning();
  return row;
}

async function maybeSnapshot(
  db: Db,
  doc: DocumentRow,
  actorId: string,
  reason: string,
  now: Date,
): Promise<void> {
  const [latest] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, doc.id))
    .orderBy(desc(documentVersions.createdAt))
    .limit(1);

  const withinWindow =
    latest &&
    latest.authorId === actorId &&
    now.getTime() - latest.createdAt.getTime() < VERSION_WINDOW_MS;
  if (withinWindow) return;

  await db.insert(documentVersions).values({
    documentId: doc.id,
    title: doc.title,
    contentHtml: doc.contentHtml,
    wordCount: doc.wordCount,
    reason,
    authorId: actorId,
  });
}

export async function updateDocument(
  db: Db,
  input: {
    doc: DocumentRow;
    actorId: string;
    title?: string;
    contentHtml?: string;
    /** Optimistic concurrency: the `updatedAt` the client last saw. */
    baseUpdatedAt?: string | null;
    reason?: string;
  },
): Promise<DocumentRow> {
  const { doc, actorId } = input;

  if (input.baseUpdatedAt) {
    const seen = new Date(input.baseUpdatedAt).getTime();
    // 1ms of slack: Postgres timestamps carry microseconds, ISO strings only
    // milliseconds, so an unchanged row can appear 1ms newer than the client saw.
    if (Number.isFinite(seen) && doc.updatedAt.getTime() - seen > 1) {
      throw conflict(
        "This document changed since you opened it. Reload to get the latest version.",
        { updatedAt: doc.updatedAt.toISOString() },
      );
    }
  }

  const nextContent = input.contentHtml;
  const contentChanged =
    typeof nextContent === "string" && isMeaningfulChange(doc.contentHtml, nextContent);
  const nextTitle =
    typeof input.title === "string" ? normaliseTitle(input.title) : doc.title;
  const titleChanged = nextTitle !== doc.title;

  if (!contentChanged && !titleChanged) return doc;

  const now = new Date();
  if (contentChanged) {
    await maybeSnapshot(db, doc, actorId, input.reason ?? "edit", now);
  }

  const [updated] = await db
    .update(documents)
    .set({
      title: nextTitle,
      ...(contentChanged
        ? {
            contentHtml: nextContent!,
            excerpt: excerptFromHtml(nextContent!),
            wordCount: wordCountFromHtml(nextContent!),
          }
        : {}),
      updatedAt: now,
      updatedById: actorId,
    })
    .where(eq(documents.id, doc.id))
    .returning();
  return updated;
}

export async function deleteDocument(db: Db, documentId: string): Promise<void> {
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function upsertShare(
  db: Db,
  input: {
    documentId: string;
    userId: string;
    role: ShareRole;
    createdById: string;
  },
): Promise<void> {
  await db
    .insert(documentShares)
    .values(input)
    .onConflictDoUpdate({
      target: [documentShares.documentId, documentShares.userId],
      set: { role: input.role },
    });
}

export async function removeShare(
  db: Db,
  input: { documentId: string; userId: string },
): Promise<void> {
  await db
    .delete(documentShares)
    .where(
      and(
        eq(documentShares.documentId, input.documentId),
        eq(documentShares.userId, input.userId),
      ),
    );
}

export async function listVersions(
  db: Db,
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  const rows = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.createdAt))
    .limit(30);

  const people = await usersByIds(
    db,
    rows.map((row) => row.authorId ?? ""),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    wordCount: row.wordCount,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    author: row.authorId ? toPublicUser(people.get(row.authorId)!) : null,
  }));
}

export async function restoreVersion(
  db: Db,
  input: { doc: DocumentRow; versionId: string; actorId: string },
): Promise<DocumentRow> {
  const [version] = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.id, input.versionId),
        eq(documentVersions.documentId, input.doc.id),
      ),
    )
    .limit(1);
  if (!version) throw notFound("Version not found.");

  const now = new Date();
  await db.insert(documentVersions).values({
    documentId: input.doc.id,
    title: input.doc.title,
    contentHtml: input.doc.contentHtml,
    wordCount: input.doc.wordCount,
    reason: "restore",
    authorId: input.actorId,
  });

  const [updated] = await db
    .update(documents)
    .set({
      contentHtml: version.contentHtml,
      excerpt: excerptFromHtml(version.contentHtml),
      wordCount: version.wordCount,
      updatedAt: now,
      updatedById: input.actorId,
    })
    .where(eq(documents.id, input.doc.id))
    .returning();
  return updated;
}

export function assertCan(condition: boolean, message: string): void {
  if (!condition) throw forbidden(message);
}
