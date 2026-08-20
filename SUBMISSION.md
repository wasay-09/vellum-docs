# Submission — Vellum

**Candidate:** Wasay
**Assignment:** Ajaia — AI-Native Full Stack Developer
**Project:** Vellum, a lightweight collaborative document editor
**Time spent:** ~5 hours (inside the 4–6 hour guidance)

## Links

| What | Where |
|---|---|
| **Live app** | https://vellum-docs-green.vercel.app |
| **Walkthrough video (3–5 min)** | PASTE_VIDEO_URL_HERE |
| **Source code** | https://github.com/wasay-09/vellum-docs |
| **Deployment health check** | `https://vellum-docs-green.vercel.app/api/health` |

## Test accounts

All seeded. Password is the same for all three: **`demo1234`**
The login screen also has one-click buttons for each, so no typing is needed.

| Email | Password | Why it exists |
|---|---|---|
| `alice@ajaia.test` | `demo1234` | Owns a document shared with Bob as **editor**; has **viewer** access to Bob's draft |
| `bob@ajaia.test` | `demo1234` | Owns a document shared with Alice as **viewer** |
| `carol@ajaia.test` | `demo1234` | Owns one private document and shares nothing — use her to confirm access control |

To see sharing work end to end, open the app in two windows (one normal, one private) and
sign in as two different accounts.

## What is in this folder

| File / folder | Contents |
|---|---|
| `README.md` | Setup and run instructions, the 60-second reviewer tour, feature list, API reference, and an explicit list of what was cut |
| `ARCHITECTURE.md` | Architecture note: scope decisions, stack rationale, data model, access-control design, content pipeline, testing strategy, what's next |
| `AI_WORKFLOW.md` | AI workflow note: tools used, where AI helped, what output I changed or rejected, and how I verified correctness |
| `SUBMISSION.md` | This file |
| `VIDEO.txt` | The walkthrough video URL, on its own |
| `vellum-docs/` (or the GitHub link) | Full source code |
| `docs/screenshots/` | Screenshots of every main surface (login, dashboard, editor, sharing, import, history, read-only mode) |

## Running it locally

Node 20+. No database to install, no Docker, no `.env`, no cloud account:

```bash
npm install
npm run dev      # http://localhost:3000, then sign in as alice@ajaia.test / demo1234
npm test         # 53 tests
```

On first boot the app creates an embedded Postgres (PGlite) under `.data/`, applies the
migrations in `drizzle/`, and seeds the three demo accounts and their documents. Full
detail — including how to point it at a real Postgres — is in the README.

## Assignment checklist

| Requirement | Status |
|---|---|
| Create a document | ✅ |
| Rename a document | ✅ inline, from the dashboard or the editor |
| Edit content in a browser | ✅ TipTap/ProseMirror |
| Save and reopen | ✅ autosave + explicit status, survives refresh and redeploy |
| Bold / italic / underline | ✅ (plus strikethrough and inline code) |
| Headings or text size variation | ✅ H1–H3 via a block-style dropdown |
| Bulleted or numbered lists | ✅ (plus block quotes and horizontal rules) |
| File upload into the product workflow | ✅ `.docx` / `.md` / `.markdown` / `.txt` → a new document, **or** appended to / replacing an existing draft. Limits stated in the UI and the README |
| Document owner | ✅ |
| Grant another user access | ✅ by email, with a role |
| Visible distinction between owned and shared | ✅ separate tabs, role badges, "Shared by …" attribution |
| Persistence across refresh | ✅ Postgres with migrations |
| Formatting preserved | ✅ sanitised HTML, allow-list matched to the editor schema |
| Shared access demonstrable | ✅ seeded shares in both directions, plus Carol as the negative case |
| Clear setup and run instructions | ✅ README |
| Working deployment | ✅ Vercel + managed Postgres |
| Basic validation and error handling | ✅ zod on every payload, typed error codes, readable messages, `413`/`415` on uploads, `409` on concurrent saves |
| At least one meaningful automated test | ✅ **53 tests**, incl. 22 API integration tests against a real Postgres |
| Short architecture note | ✅ `ARCHITECTURE.md` |
| AI workflow note | ✅ `AI_WORKFLOW.md` |
| Walkthrough video (3–5 min) | ✅ `VIDEO.txt` |
| **Stretch:** version history | ✅ snapshots with author attribution + restore |
| **Stretch:** export | ✅ Markdown, plain text, HTML, print/PDF |
| **Stretch:** role-based permissions | ✅ owner / editor / viewer, enforced server-side |

## Status

**Working end to end:** sign-in, document CRUD, rich-text editing with autosave and
save/reopen fidelity, `.docx`/`.md`/`.txt` import (as a new document and into an existing
draft), role-based sharing with live enforcement and revocation, version history with
restore, four export paths, and the deployed build.

**Incomplete by choice:** real-time co-editing (conflicts are detected and surfaced, not
merged), comments/suggestions, account signup and password reset, attachments,
folders/trash/tags, dark mode, and browser E2E tests. Reasoning for each is in
`ARCHITECTURE.md` §8.

**With another 2–4 hours** I would add, in this order: presence indicators over a websocket
channel (removes most conflicts by making the other person visible), comments anchored to
editor ranges, invite links for people without an account, and a Playwright smoke test in
CI. Detail in `ARCHITECTURE.md` §11.
