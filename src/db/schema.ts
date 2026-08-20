import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Users are seeded (see scripts/seed.ts). The assignment allows mocked auth, so
 * we keep a real password hash + signed-cookie session but no signup flow.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Tailwind-ish accent used for avatars, kept server-side so it is stable. */
  accent: text("accent").notNull().default("indigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled document"),
    /** Sanitised HTML produced by the editor. See src/lib/content.ts. */
    contentHtml: text("content_html").notNull().default(""),
    /** Denormalised plain-text preview so the dashboard never parses HTML. */
    excerpt: text("excerpt").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("documents_owner_idx").on(table.ownerId)],
);

export const documentShares = pgTable(
  "document_shares",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "viewer" = read-only, "editor" = may edit + import, never re-share. */
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.userId] }),
    index("document_shares_user_idx").on(table.userId),
  ],
);

/** Snapshot taken before a save that materially changes the document. */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentHtml: text("content_html").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    /** Why the snapshot exists: "edit" | "import" | "restore". */
    reason: text("reason").notNull().default("edit"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("document_versions_doc_idx").on(table.documentId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  shares: many(documentShares),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, { fields: [documents.ownerId], references: [users.id] }),
  shares: many(documentShares),
  versions: many(documentVersions),
}));

export const documentSharesRelations = relations(documentShares, ({ one }) => ({
  document: one(documents, {
    fields: [documentShares.documentId],
    references: [documents.id],
  }),
  user: one(users, { fields: [documentShares.userId], references: [users.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentShareRow = typeof documentShares.$inferSelect;
export type DocumentVersionRow = typeof documentVersions.$inferSelect;
