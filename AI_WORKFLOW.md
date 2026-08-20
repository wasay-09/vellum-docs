# AI workflow note

## Tools used

| Tool | What it did |
|---|---|
| **Claude Code (Opus)** in the terminal | The primary pair. Scaffolding, the repetitive glue (route handlers, TipTap toolbar wiring, dialog markup), test scaffolds, first drafts of these docs. |
| **Parallel Claude Code subagents** | Two UI surfaces built concurrently — the editor (`src/components/editor/*`) and the login/dashboard shell (`src/components/documents/*`, `src/components/auth/*`) — against a contract I had already fixed. |
| **Vitest in watch mode** | The verification loop. Every AI-written module had to survive it before it counted as done. |
| **TypeScript strict + ESLint** | The other half of the loop: the fastest reviewer of generated code is the compiler. |

## The workflow that actually mattered: contracts first, then parallelism

The mistake I wanted to avoid was letting agents invent their own interfaces and then
spending the back half of the timebox reconciling them. So the order was deliberate:

1. **I wrote the contract layer by hand first** — the database schema, `permissions.ts`
   (the access-control rules), `api-types.ts` (the DTOs), `api-client.ts` (the typed fetch
   wrapper) and the error taxonomy. Roughly 400 lines that fix every boundary in the app.
2. **Then I parallelised.** Two agents built the two UI surfaces simultaneously, each given
   the exact API contract, the exact design tokens, and an explicit list of files it owned.
   No shared files, so no merge conflicts.
3. **Meanwhile I wrote the API and the tests myself**, because that is where a subtle
   mistake is a security bug rather than a visual one.
4. **Then I integrated and reviewed** — which is where the interesting corrections happened.

That sequencing is the reason three surfaces landed in one timebox. It is also the reason
the seams are boring: the editor and the dashboard were written by different agents and
neither one had to know the other existed.

## Where AI materially sped things up

- **Repetitive, well-specified glue.** Eleven route handlers with the same
  validate → authorise → mutate → re-read shape. The TipTap toolbar (twelve commands, each
  with active state and a shortcut hint). Dialog markup. This is the bulk of the line count
  and almost none of the thinking.
- **Recall instead of documentation.** Mammoth's buffer API, `sanitize-html`'s
  `transformTags`, Turndown's rule API, Next 16's async `params`/`cookies`, Tailwind v4's
  CSS-first `@theme` — all things I would otherwise have read docs for.
- **Test breadth.** I specified the risks to cover; the agent produced the cases. Going from
  "the permission matrix is tested" to "the permission matrix is tested including an unknown
  role in the database" is a one-line instruction.
- **Fixtures and seed content.** A valid minimal `.docx` (zipped OOXML) as a test fixture,
  and demo documents whose content actually demonstrates the features.
- **First drafts of prose.** Including this file — then edited hard, because the first draft
  of any AI-written document is longer and vaguer than it needs to be.

## What I changed or rejected

The judgment calls are the part worth reading:

1. **Storage format: rejected ProseMirror JSON, chose sanitised HTML.** The model's first
   instinct (a defensible one) was to persist the editor's JSON document. I rejected it:
   HTML is the format the editor, both importers and all three exporters already speak, and
   JSON would have meant HTML↔JSON conversion on every edge — including on the server, with
   a DOM shim. I took the *reason* JSON was suggested (schema validation) and got it another
   way: an allow-list sanitiser on every write path whose tags mirror the editor schema. The
   trade-off is written down in ARCHITECTURE.md §5 rather than hidden.

2. **Local database: rejected "SQLite locally, Postgres in production".** Two dialects means
   local green does not imply deployed green. I moved us to PGlite — actual Postgres compiled
   to WASM — so local dev, the test suite and production run the *same* SQL and the *same*
   migrations, and a reviewer still needs zero setup. Then I added the guard the idea
   demanded: production **refuses to boot** on the WASM fallback, because a per-instance
   database on a serverless platform would silently lose writes.

3. **`.docx` parsing: rejected doing it in the browser.** Suggested as "keeps the server
   light". It would also have shipped a parser to every visitor and, worse, made imported
   HTML arrive at the API as client input on a path that bypassed the sanitiser. Conversion
   is server-side, so imports and typing go through the same sanitiser.

4. **Concurrency tolerance: 1000 ms → 1 ms.** The generated conflict check allowed a full
   second of clock slack "for timestamp precision". That is not precision, that is a hole:
   two people saving within the same second would silently overwrite each other. The real
   requirement is 1 ms (Postgres keeps microseconds, JSON only milliseconds). There is now a
   test that fails if that tolerance grows back.

5. **Version snapshots: added windowing that wasn't there.** The first implementation
   snapshotted on every save, which with a 900 ms autosave means a version per sentence. I
   changed it to at most one snapshot per author per 45-second window, but *always* one when
   the author changes — so "what did this look like before Bob rewrote it" stays answerable.
   Two tests pin both halves of that rule.

6. **`403` → `404` for documents you cannot see.** A `403` confirms the document exists.
   Every route now treats "not yours" and "not real" identically, and there is a test that
   asserts a stranger gets `404`, not `403`, on a real document id.

7. **Bundle discipline the agent missed.** The dashboard imported one constant
   (`MAX_UPLOAD_BYTES`) from a module that transitively pulls in `sanitize-html` and
   `marked` — dragging the whole conversion stack into the browser bundle to render a file
   picker. I split the client-safe half into `lib/import-spec.ts`. The agent's own report
   flagged the smell; the fix was mine.

8. **Cross-cutting fixes belong in one place.** One agent handled Escape-to-close inside a
   single dialog. I moved it into the shared `Modal` primitive so every dialog gets it.

9. **Rejected outright:** a `middleware.ts` auth guard (route handlers already check, and it
   duplicates the rule in a second place), a toast library (three states, one banner
   component), Zustand (server components plus `useState` was enough), and Yjs/websockets for
   real-time editing (correct engineering, wrong timebox — detecting conflicts honestly was
   the right size).

## How I verified correctness

- **52 automated tests**, split by risk rather than by coverage percentage: pure unit tests
  for the permission matrix, the sanitiser and the file converters; **22 API integration
  tests** that drive the real Next.js route handlers against a real in-memory Postgres with
  only the cookie store faked. Those integration tests are the ones I trust, because they
  assert behaviour a reviewer will actually try: a viewer's `PATCH` is rejected, an unshared
  document `404`s for a stranger, a `.docx` upload becomes a titled document, a stale save
  `409`s, revoking a share removes the document from the collaborator's dashboard.
- **A test caught a real bug the same day it was written.** Plain-text extraction ran the
  HTML through the sanitiser with tags stripped, which dropped block boundaries — so
  `<p>Hello</p><p>World</p>` became `HelloWorld`, quietly corrupting every excerpt and word
  count in the product. The test asserted `"Hello World"` and failed. Fixed in
  `htmlToPlainText` by spacing block boundaries first.
- **Adversarial input on purpose.** The Markdown fixture contains `<script>alert('xss')</script>`
  and the `.txt` fixture contains `<b>` tags, so the tests prove that a hostile file cannot
  smuggle markup through the import path and that plain text stays plain.
- **Manual two-account pass** for everything a test cannot judge: does autosave *feel*
  instant, does read-only mode look intentional rather than broken, does the conflict banner
  read like English. I ran the sharing flow in two browser profiles side by side.
- **`tsc --noEmit` and ESLint on every file**, and `GET /api/health` on the deployed build to
  prove it can reach its database rather than assuming it.

## What AI did not decide

The scope cut — four areas deep instead of nine shallow — the role model, the decision to
detect conflicts rather than merge them, and the ordering of what to build next. Those are
product judgment calls, and they are the ones I would expect to defend in the interview. AI
made the typing faster; it did not choose what to build, and every one of the nine
corrections above exists because a generated answer was plausible and still wrong.
