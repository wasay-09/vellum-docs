# Architecture note

**Vellum** — a lightweight collaborative document editor. Written for the Ajaia AI-Native
Full Stack assignment in a single timeboxed sitting.

The brief was deliberately open-ended, so the first decision was what *not* to build.
This note covers the scope call, the stack, the four or five decisions that actually
shaped the code, and what I would do next.

---

## 1. Scope: four things, done properly

Google Docs is a decade of work. Inside a timebox, the useful thing to demonstrate is a
*coherent slice*: one flow that a real person could use end to end, with the hard parts
actually hard-wired rather than mocked.

I picked depth in four areas, in this order of priority:

| Priority | Area | Why it earned the time |
|---|---|---|
| 1 | **Editing that feels real** | This is the product. Autosave, formatting, save/reopen fidelity, read-only mode. A demo where the editor loses text is worthless. |
| 2 | **Sharing with actual roles** | The interesting engineering in a collaborative tool is authorisation, not text rendering. Owner / editor / viewer, enforced server-side. |
| 3 | **Import as a real conversion** | `.docx` → structured HTML via a real OOXML parse, not a filename in a table. This is where "file upload" becomes product-relevant. |
| 4 | **Persistence you can trust** | Real Postgres, real migrations, real optimistic-concurrency handling. |

Everything else was cut explicitly (§8), not left half-finished.

---

## 2. Stack, and why

| Choice | Reason |
|---|---|
| **Next.js 16 (App Router)** | One deployable, one language, server components for the first paint and route handlers for the API. In a timebox, a second service is pure overhead. |
| **TipTap 3 (ProseMirror)** | A schema-constrained editor, not a `contenteditable` free-for-all. The schema is the reason imported and pasted content stays predictable. |
| **Postgres + Drizzle** | Sharing is inherently relational (documents × users × roles). Drizzle gives typed SQL without hiding the query. |
| **Two drivers, one dialect** | `node-postgres` against Neon in production; **PGlite** (Postgres compiled to WASM) when `DATABASE_URL` is unset. Same SQL, same migrations, same seed. |
| **Vitest** | Fast enough to run on every change, and it can drive Next route handlers directly. |

### The PGlite call

The reviewer-experience problem with "real Postgres" is setup: Docker, a cloud signup, a
connection string. The problem with SQLite is that it is a *different dialect* from
production, so local green does not mean deployed green.

PGlite solves both: `npm install && npm run dev` boots an embedded Postgres into `.data/`,
applies the same `drizzle/*.sql` migrations, and seeds the same demo workspace — no Docker,
no account, no credentials. Production uses the same schema over TCP. The tests use the
in-memory variant of the same engine, so the test suite exercises real SQL, real
constraints and real `ON CONFLICT` behaviour.

The guard that matters: `getDb()` **throws** if `NODE_ENV=production` and `DATABASE_URL`
is missing (`src/db/client.ts`). A serverless container silently falling back to a
per-instance WASM database would be the worst possible failure — data that appears to save
and then vanishes.

---

## 3. Data model

```
users            id, email, name, password_hash, accent
documents        id, owner_id → users, title, content_html, excerpt, word_count,
                 created_at, updated_at, updated_by_id → users
document_shares  (document_id, user_id) PK, role: 'viewer' | 'editor', created_by_id
document_versions id, document_id, title, content_html, word_count,
                 reason: 'edit' | 'import' | 'restore', author_id, created_at
```

Two deliberate denormalisations: `excerpt` and `word_count` are computed on write. The
dashboard renders 20 cards without parsing 20 HTML documents, and the editor's word count
is server-authoritative.

`document_shares` is a join table with the role *on the edge*, not a column on the
document. That is what makes "share with N people at different levels" free, and it is why
adding `commenter` or `owner-transfer` later is a data change, not a redesign.

---

## 4. Access control: one function, fail closed

Every authorisation decision in the app comes from one pure function,
`resolveAccess()` in `src/lib/permissions.ts`, which maps *(owner, shares, viewer)* to a
capability set:

```ts
owner  → view, edit, rename, import, share, delete, history, restore
editor → view, edit, rename, import, history, restore
viewer → view, history            (and export — reading is reading)
none   → nothing
```

Three properties I cared about:

1. **Pure and unit-tested.** No database, no request context — so the whole permission
   matrix is covered by fast tests, including an unknown role in the database, which
   resolves to *no access* rather than a guess.
2. **One choke point.** `loadDocumentForUser()` is the only way a handler gets a document,
   and it refuses to return one the caller cannot view. A route cannot forget the check.
3. **Missing access is `404`, not `403`.** A `403` confirms the document exists. Every
   route treats "not yours" and "not real" identically.

The UI mirrors the same flags (`access.canEdit` hides the toolbar, `canShare` hides the
share button) but never *decides* anything — the server re-derives access on every call.

---

## 5. Content: HTML at the boundary, sanitised on every write

Documents are stored as HTML. The alternative — persisting ProseMirror JSON — is arguably
the better long-term choice (it is diffable, and it is what a CRDT would need). I chose
HTML on purpose:

- It is the one format the editor, the `.docx` importer, the Markdown importer and all
  three exporters already speak. Storing JSON would have meant HTML↔JSON conversion on
  every one of those edges, on the server, with a DOM shim.
- The value of JSON's schema validation can be recovered cheaply: an **allow-list
  sanitiser** on every write path (`sanitizeDocumentHtml`), whose allowed tags mirror the
  editor schema exactly.

So the boundary rule is: *the browser is not trusted, and neither is a Word file*.
`<script>`, `on*` handlers, `javascript:` URLs, `<iframe>`, `<style>` and `<form>` are
stripped; legacy tags are folded into the schema (`<b>`→`<strong>`, `<h5>`→`<h3>`,
`<div>`→`<p>`) so imports keep their structure instead of losing it; external links get
`rel="noopener noreferrer"`. This runs on editor saves *and* on imports — one function,
one test file, no second path to forget.

The trade-off, stated plainly: HTML is a worse substrate for future real-time collaboration
than JSON. The migration path is a one-shot backfill (`generateJSON` per document) behind
the same API shape.

---

## 6. Autosave and concurrent edits

Autosave is a 900 ms debounce, plus an immediate flush on ⌘/Ctrl-S and on unmount, and it
skips no-op saves (whitespace-only changes are not changes).

Because two people can hold the same document open, every save carries the `updatedAt` the
client last saw. If the row has moved on, the API returns **409** with the current
timestamp instead of writing, and the editor stops autosaving and shows a reload prompt.
The user's text stays on screen — it is never silently overwritten, and their work is never
silently thrown away.

This is *last-writer-wins with detection*, not merge. Real concurrent editing needs OT or
a CRDT (Yjs) plus a websocket tier; that is a multi-day change and, more importantly, it
would have eaten the time that sharing and import needed. Detecting the conflict honestly
is the right amount of correctness for this scope.

Version snapshots use the same insight. A snapshot on every autosave would be noise, so
`maybeSnapshot()` writes at most one per author per 45-second window — but *always* one
when the author changes. The practical effect: "what did the document look like before
Bob rewrote it" is always answerable, and a test asserts three rapid saves produce one
version while a second author produces another.

---

## 7. File import

Conversion happens **server-side** (`src/lib/import.ts`):

```
.docx → mammoth (real OOXML parse) ─┐
.md   → marked (GFM)               ─┼→ sanitizeDocumentHtml → persist
.txt  → escaped paragraphs         ─┘
```

Server-side because (a) the browser should not have to trust or download a docx parser,
(b) every imported byte then passes the same sanitiser as editor input, and (c) it keeps
the conversion testable against a real `.docx` fixture rather than a mocked file input.

Two product touches worth calling out: the importer lifts the document title from the
first `<h1>` rather than the filename when the file has one, and imports into an existing
document can **append or replace**, because "add this file to my draft" and "start from
this file" are different intents. Limits (2 MB, `.docx/.md/.markdown/.txt`) are stated in
the UI, in the README, and enforced twice — client-side for a fast message, server-side
because clients lie. Unsupported types get `415` with the supported list; a corrupt `.docx`
gets a readable message rather than a stack trace.

---

## 8. What I deliberately did not build

| Not built | Why, and what I did instead |
|---|---|
| Real-time co-editing (CRDT/websockets) | Days of work. Conflicts are *detected* and surfaced instead of merged. |
| Comments / suggestion mode | Needs anchored ranges that survive edits — a project of its own. |
| Signup, password reset, email | The brief allows seeded accounts. Real hashing (scrypt) and a signed HttpOnly session cookie, but no account lifecycle. |
| Attachments alongside documents | Import (file → editable content) is the more product-relevant upload for a *document editor*; blob storage would have added a provider dependency for less value. |
| Folders, trash, search-by-content, tags | Dashboard search filters titles and excerpts client-side. |
| Server-side PDF rendering | Export covers Markdown, plain text and standalone HTML; PDF goes through the browser's print dialog with a print stylesheet. |
| Dark mode, tuned mobile editing | Desktop-first, which is where the product lives. The layout is responsive down to phone widths, but touch editing ergonomics were not tuned. |
| E2E browser tests | Deliberate: see §9. |

## 9. Testing strategy

52 tests, in two layers, chosen for *risk coverage per second* rather than coverage
percentage:

- **Pure units** — the permission matrix, the sanitiser, the derived fields, the file
  converters. Milliseconds each, and they cover the logic where a mistake is a security
  bug or silent data loss.
- **API integration (22 tests)** — the real Next.js route handlers, driven against a real
  in-memory Postgres, with only the cookie store faked. These cover the things a unit test
  cannot: that a viewer's `PATCH` is actually rejected, that an unshared document 404s for
  a stranger, that a `.docx` upload becomes a titled document, that a stale save 409s, that
  revoking a share removes the document from the collaborator's list.

No Playwright. A browser suite is the right investment for a product with a release
cadence; inside a timebox it would have bought a slower version of what the API tests
already prove, and the editor interactions it would cover are the part a reviewer verifies
by watching the walkthrough video anyway.

One test earned its keep immediately: extracting plain text via the sanitiser dropped
block boundaries, so `<p>Hello</p><p>World</p>` became `HelloWorld` — every excerpt and
word count in the product would have been subtly wrong. Fixed in `htmlToPlainText`.

## 10. Deployment

Vercel (Next.js, Node runtime for the routes that touch `mammoth`/`pg`) + managed Postgres
via `DATABASE_URL`. Migrations and seeding are one command (`npm run db:setup`), and
`GET /api/health` reports which driver is live plus row counts — a 200 from it is proof the
deployment can actually reach its database.

## 11. What I would build next, with another 2–4 hours

1. **Presence + live cursors** (~2 h): a lightweight websocket channel broadcasting
   `{documentId, userId, cursor}`. Not full CRDT merge, but it removes most conflicts by
   making the other person visible — the highest perceived-value increment.
2. **Comments** (~2 h): anchored to ProseMirror marks, with a sidebar and resolve state.
3. **Share links with roles** (~1 h): tokenised `?invite=` URLs so sharing does not require
   the other person to already exist.
4. **Playwright smoke test** (~1 h) covering login → type → autosave → share → viewer
   read-only, run in CI on every push.

Ordered by user-visible value per hour, which is the same order I would defend in a
planning meeting.
