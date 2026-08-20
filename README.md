# Vellum

[![CI](https://github.com/wasay-09/vellum-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/wasay-09/vellum-docs/actions/workflows/ci.yml)

A lightweight collaborative document editor — create, format, import and share documents.
Built for the **Ajaia AI-Native Full Stack Developer assignment**.

**Live app:** __LIVE_URL__
**Repository:** https://github.com/wasay-09/vellum-docs

> Sign in with any demo account below (they are all seeded, password `demo1234`) and you
> can test the whole sharing flow with two browser tabs.

| Account | Password | Starts with |
|---|---|---|
| `alice@ajaia.test` | `demo1234` | Owns **Welcome to Vellum** (shared with Bob as **editor**), can view Bob's draft |
| `bob@ajaia.test` | `demo1234` | Owns **Q3 Onboarding Revamp** (shared with Alice as **viewer**) |
| `carol@ajaia.test` | `demo1234` | Owns one private document, shares nothing — proves access control works |

---

## 60-second reviewer tour

The fastest path through everything that matters:

1. **Sign in as Alice** (one click on the login screen) → the dashboard shows *Owned by me*
   and *Shared with me* as separate tabs, with a **Can edit** / **View only** badge on
   anything shared with her.
2. **Open “Welcome to Vellum”** → type. The status in the header goes *Saving…* → *All
   changes saved*. Reload the page: the text and the formatting are still there.
3. **Format something** — bold, italic, underline, H1/H2/H3, bulleted and numbered lists,
   quote, inline code, undo/redo. Keyboard shortcuts work (⌘B / ⌘I / ⌘U / ⌘S).
4. **Import a file** → *Import* in the header. Use `tests/fixtures/sample.docx` (or any
   `.docx` / `.md` / `.txt`) and choose **append** or **replace**. Headings, bold, italics
   and lists survive the conversion. Importing from the *dashboard* instead creates a brand
   new document titled from the file's first heading.
5. **Share it** → *Share*, pick `carol@ajaia.test`, role **Viewer**, send.
6. **Open a second browser (or a private window) and sign in as Carol** → the document is
   now under *Shared with me*, opens **read-only**, with a banner explaining why. No
   toolbar, no autosave, and the API rejects writes even if you call it directly.
7. Back as Alice, flip Carol to **Editor** → Carol can now edit and import, but still
   cannot share or delete. Remove the share → the document disappears from Carol's
   dashboard entirely.
8. **History** → snapshots with author and timestamp, restorable. **Export** → Markdown,
   plain text, HTML, or print to PDF.

---

## Screenshots

| | |
|---|---|
| ![Dashboard](docs/screenshots/02-dashboard-owned.png)<br>**Dashboard** — owned vs shared, with roles and collaborators | ![Editor](docs/screenshots/04-editor.png)<br>**Editor** — formatting toolbar, autosave status, word count |
| ![Sharing](docs/screenshots/07-share-dialog-granted.png)<br>**Sharing** — grant by email, change role, revoke | ![Read-only](docs/screenshots/13-carol-readonly-editor.png)<br>**Viewer** — read-only, with the reason stated |
| ![Import](docs/screenshots/08-import-dialog.png)<br>**Import** — `.docx` / `.md` / `.txt`, append or replace | ![History](docs/screenshots/10-version-history.png)<br>**History** — snapshots by author, restorable |
| ![Conflict](docs/screenshots/17-conflict-banner.png)<br>**Concurrent edit** — the stale client is stopped, not overwritten | ![Login](docs/screenshots/01-login.png)<br>**Sign in** — one-click seeded accounts |

More in [`docs/screenshots/`](docs/screenshots) — login, search, export menu, and the
error states.

## What is implemented

**Documents & editing**
- Create, rename (inline, from the dashboard or the editor), delete, reopen
- Rich text: **bold**, *italic*, <u>underline</u>, strikethrough, H1–H3, bulleted and
  numbered lists, block quotes, inline code, horizontal rules, undo/redo, clear formatting
- Autosave (900 ms debounce) with an explicit saved/saving/unsaved indicator, ⌘S to flush
- Word count, "last edited by", relative timestamps
- Concurrent-edit detection: if someone else saved while you had the document open, the
  save is refused with a reload prompt instead of silently overwriting their work

**File import** (`.docx`, `.md`, `.markdown`, `.txt` — max 2 MB, stated in the UI too)
- From the dashboard → creates a new document, titled from the file's first heading
- From inside a document → **append** to the draft or **replace** it
- `.docx` is a real OOXML parse (mammoth), not a text dump; unsupported types and corrupt
  files fail with a readable message

**Sharing**
- Every document has an owner; access is granted per user by email with a role
- **Owner**: everything, including sharing and deleting
- **Editor**: read, write, rename, import — cannot share or delete
- **Viewer**: read and export only; the editor opens read-only
- Owned vs shared documents are visually distinct (separate tabs + role badges)
- Roles can be changed or revoked at any time; revoking hides the document immediately

**Persistence**
- Postgres, with migrations and an idempotent seed
- Documents, sharing and version history all survive refresh and redeploy
- Formatting is preserved as sanitised HTML

**Extras** (the assignment's optional stretch)
- **Version history** with author attribution and one-click restore (restores are
  themselves undoable)
- **Export** to Markdown, plain text, standalone HTML, and print/PDF
- **Role-based permissions** beyond a simple access flag
- `GET /api/health` for deployment smoke tests

## What is intentionally not built

Scope cuts, made up front — see [ARCHITECTURE.md](./ARCHITECTURE.md) §8 for the reasoning:

- **No real-time co-editing.** Conflicts are detected and surfaced, not merged. No CRDT, no
  websockets, no live cursors.
- **No comments or suggestion mode.**
- **No signup/password reset/email.** Seeded accounts only (real scrypt hashes and a signed
  HttpOnly session cookie, but no account lifecycle).
- **No folders, trash, tags, or full-text search.** Dashboard search filters titles and
  excerpts on the client.
- **No attachments** stored alongside documents — file upload is wired to *import*, which is
  the more product-relevant behaviour for a document editor.
- **No dark mode, no mobile editing polish, no E2E browser tests.**

---

## Run it locally

Requires **Node 20+**. No database to install, no Docker, no cloud account, no `.env`.

```bash
git clone https://github.com/wasay-09/vellum-docs.git
cd vellum-docs
npm install
npm run dev          # http://localhost:3000
```

On first boot the app creates an **embedded Postgres** (PGlite — Postgres compiled to
WASM) under `.data/`, applies the migrations in `drizzle/`, and seeds the three demo
accounts and their documents. Sign in with `alice@ajaia.test` / `demo1234`.

```bash
npm test             # 52 tests (unit + full API integration)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:reset     # delete the local database; it is recreated and reseeded on next boot
```

### Running against a real Postgres

Set `DATABASE_URL` (Neon, Supabase, local Postgres — anything Postgres-compatible) and the
app switches drivers automatically:

```bash
cp .env.example .env
# DATABASE_URL="postgres://user:password@host/db?sslmode=require"
# AUTH_SECRET="$(openssl rand -base64 32)"
npm run db:setup     # migrate + seed the remote database
npm run dev
```

`DATABASE_URL` is **required** in production: the app refuses to boot with the WASM
fallback when `NODE_ENV=production`, because a per-instance database would silently lose
writes on a serverless platform.

### Deploying

Deployed on Vercel from `main`:

```bash
vercel link
vercel env add DATABASE_URL production   # any Postgres; Neon's free tier is fine
vercel env add AUTH_SECRET production    # openssl rand -base64 32
npm run db:setup                         # with DATABASE_URL in your shell/.env
vercel --prod
```

Then check `__LIVE_URL__/api/health` → `{"status":"ok","driver":"postgres",...}`.

---

## Project structure

```
src/
  app/
    login/, documents/, documents/[id]/     screens (server components + client islands)
    api/                                    route handlers: auth, documents, shares,
                                            import, versions, export, health
  components/
    editor/     TipTap editor, toolbar, share dialog, import dialog, history, export menu
    documents/  dashboard, document cards
    shell/, auth/, ui/                      header, login form, shared primitives
  db/
    schema.ts   Drizzle schema (source of truth for types)
    client.ts   driver selection: node-postgres vs embedded PGlite
    queries.ts  every database read/write, each one access-checked
    seed.ts     idempotent demo workspace
  lib/
    permissions.ts  pure access-control rules (owner/editor/viewer)
    content.ts      HTML sanitiser + derived fields (excerpt, word count)
    import.ts       .docx/.md/.txt → sanitised HTML
    export.ts       HTML → Markdown / text
    session.ts      signed-cookie sessions
    errors.ts       typed API errors → JSON responses
drizzle/            SQL migrations
tests/              unit + API integration tests, with a real .docx fixture
```

### API surface

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/auth/login` · `/api/auth/logout` · `GET /api/auth/me` | signed HttpOnly cookie |
| `GET`/`POST` | `/api/documents` | list (owned + shared) / create |
| `GET`/`PATCH`/`DELETE` | `/api/documents/:id` | `PATCH` takes `baseUpdatedAt` and can return `409` |
| `POST` | `/api/documents/import` | multipart → new document |
| `POST` | `/api/documents/:id/import` | multipart, `mode=append\|replace` |
| `POST`/`PATCH`/`DELETE` | `/api/documents/:id/shares` | grant / change role / revoke |
| `GET`/`POST` | `/api/documents/:id/versions` | list / restore |
| `GET` | `/api/documents/:id/export?format=md\|txt\|html` | download |
| `GET` | `/api/users` · `/api/health` | share picker · deploy smoke test |

Errors are always `{ "error": { "code", "message", "details? } }` with a meaningful status
(`400` validation, `401` unauthenticated, `403` role too low, `404` not yours / not found,
`409` concurrent edit, `413` too large, `415` unsupported file type).

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — scope decisions, data model, access control,
  content pipeline, testing strategy, what's next
- [AI_WORKFLOW.md](./AI_WORKFLOW.md) — which AI tools were used, where they helped, what
  output was rejected, and how correctness was verified
- [SUBMISSION.md](./SUBMISSION.md) — deliverables checklist and status

## Status

**Working end to end:** authentication, document CRUD, rich-text editing with autosave,
save/reopen fidelity, `.docx`/`.md`/`.txt` import (new document *and* into an existing
draft), role-based sharing with live enforcement, version history with restore, four export
formats, and the deployed build.

**Incomplete by choice:** real-time collaboration, comments, account signup, attachments,
folders/trash, dark mode, browser E2E tests.

**Next 2–4 hours:** presence indicators over a websocket channel, comments anchored to
editor ranges, invite links for people without an account, and a Playwright smoke test in
CI. Reasoning in [ARCHITECTURE.md](./ARCHITECTURE.md) §11.
