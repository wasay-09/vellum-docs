# Walkthrough video script (target: 4:00, hard ceiling 5:00)

**Setup before you hit record**
- Two browser windows, side by side or quick-switchable: **Window A** signed in as
  `alice@ajaia.test`, **Window B** in a private/incognito window, *not yet signed in*.
- Window A on the **dashboard** (`/documents`). Window B on the **login screen**.
- Have `tests/fixtures/sample.docx` somewhere easy to find in the file picker (Downloads or
  Desktop is fine — copy it there first).
- Zoom the browser to ~110% so text is readable in the recording. Close bookmark bars,
  notification popups, Slack.
- One dry run first. It removes 90% of the "uhh" moments.

---

## 0:00–0:25 — What it is, and the scope call

> "This is **Vellum**, a lightweight collaborative document editor I built for the Ajaia
> assignment. Google Docs is a decade of work, so the first decision was what *not* to
> build. I went deep on four things: an editing experience that actually feels reliable,
> sharing with real roles, file import as a real conversion, and persistence I can trust.
> Everything else — real-time co-editing, comments, folders — I cut on purpose, and I'll
> come back to why."

*(On screen: the dashboard, Owned by me / Shared with me tabs visible.)*

## 0:25–1:15 — The core loop: create, format, autosave, reopen

Click **New document**. Type a title. Then:

> "New document, rename it inline. The formatting is what you'd expect — headings, bold,
> italic, underline, lists, quotes — and the shortcuts work."

Do it live and narrate briefly: `⌘B` bold a phrase, make an **H2**, add a **bulleted list**,
then a **numbered list**.

> "Watch the header: *Saving…* then *All changes saved*. Autosave is a 900-millisecond
> debounce, plus an immediate flush on ⌘S and on navigate-away, and it skips no-op saves so
> whitespace doesn't spam the database."

**Reload the page.** Let the reload be visible.

> "Reload — content and formatting come back exactly. It's persisted as sanitised HTML in
> Postgres, with a word count and an excerpt computed on write."

## 1:15–2:00 — File import (the upload requirement)

Click **Import** → pick `sample.docx` → choose **Append** → import.

> "Upload is wired to import, which for a document editor is the product-relevant
> behaviour. `.docx`, `.md`, `.markdown` and `.txt`, up to 2 MB — stated in the UI and the
> README. This is a real OOXML parse with mammoth, server-side, so headings, bold and
> italics survive."

Point at the imported heading and bold text.

> "Two intents, two behaviours: **append** adds the file to the draft I'm in; **replace**
> starts over from the file. And importing from the dashboard instead creates a brand new
> document, titled from the file's first heading rather than the filename."

> "Everything imported goes through the same allow-list sanitiser as my own typing — my test
> fixture literally contains a `<script>` tag, and it never makes it into the document."

## 2:00–3:05 — Sharing, which is where the real engineering is

Click **Share**. Add `carol@ajaia.test` as **Viewer**. Send.

> "Every document has an owner. Access is granted per user with a role. Owner can do
> everything including share and delete. Editor can write, rename and import but never
> re-share. Viewer reads and exports. One pure function decides all of it, it's
> unit-tested, and the API re-derives it on every single request — the UI never decides."

Switch to **Window B**, sign in as Carol (one click on the demo account).

> "Carol's dashboard: the document shows up under **Shared with me**, with a **View only**
> badge — owned and shared are visually distinct."

Open it.

> "Read-only: no toolbar, no autosave, and a banner that says why. And it's not just the UI
> hiding buttons — if you call the API directly as a viewer, the write is rejected with a
> 403. There's a test for exactly that."

Back to **Window A**: change Carol to **Editor**.

> "Promote her to editor…"

Window B: reload, type a word — it saves.

> "…now she can edit. Still can't share or delete."

*(If you're short on time, skip the revoke step and just say it:)*

> "Revoking access removes the document from her dashboard entirely, and a direct request
> returns 404, not 403 — a 403 would confirm the document exists."

## 3:05–3:35 — The two stretch features, fast

**History** → point at snapshots with authors → restore one.

> "Version history came free once I had the write path in one place. It snapshots at most
> once per author per 45-second window, so autosave doesn't create a version per sentence,
> but *always* snapshots when the author changes — so 'what did this look like before Bob
> rewrote it' is always answerable. Restores are themselves undoable."

**Export** → open the menu.

> "Export to Markdown, plain text, HTML, or print to PDF."

## 3:35–4:15 — Implementation decisions and where AI fit

> "Three decisions I'd defend. **One:** documents are stored as sanitised HTML, not editor
> JSON — HTML is the one format the editor, both importers and all three exporters already
> speak, and I got the schema-validation benefit back with an allow-list sanitiser on every
> write. **Two:** concurrent edits are *detected*, not merged. Every save carries the
> timestamp the client last saw; if the row moved on, it's a 409 and a reload prompt instead
> of silently overwriting someone. A CRDT is correct engineering and the wrong size for this
> timebox. **Three:** local dev runs Postgres compiled to WASM, so `npm install && npm run
> dev` boots a seeded database with no Docker and no cloud account — same dialect, same
> migrations as production, and production hard-fails if the real database URL is missing."

> "On AI: I wrote the contract layer by hand first — schema, permissions, DTOs, error
> taxonomy — and then ran agents in parallel on the two UI surfaces against that contract,
> while I did the API and the tests myself. That sequencing is why three surfaces landed in
> one timebox. It also caught things: the generated conflict check allowed a full second of
> clock slack, which would let two people overwrite each other inside the same second — I
> cut it to one millisecond and pinned it with a test. And a test I asked for caught a real
> bug: plain-text extraction was dropping block boundaries, so every excerpt and word count
> in the product would have been subtly wrong. 52 tests, 22 of which drive the real route
> handlers against a real Postgres."

## 4:15–4:35 — What's next, and close

> "Deprioritised on purpose: real-time co-editing, comments, signup, folders, dark mode,
> browser E2E tests. With another two to four hours I'd add presence indicators over a
> websocket — that removes most conflicts by making the other person visible — then
> comments anchored to editor ranges, then invite links. Ordered by user-visible value per
> hour."

> "Live app, repo, README, architecture note and the AI workflow note are all in the
> submission. Thanks for watching."

---

## Delivery notes

- **Say the numbers.** "900 milliseconds", "one millisecond", "45-second window", "52 tests,
  22 integration". Specifics read as ownership.
- **Never say "the AI built this".** Say "I had an agent do X against the contract I fixed,
  then I changed Y because Z." Same facts, correct framing for an AI-native role.
- **Show, then explain — not the reverse.** Click first, narrate over the result.
- If something breaks live, say what you'd check and move on. Debugging on camera burns the
  clock; composure reads better than a fix.
- Watch the clock at the 3:00 mark. If you're behind, cut the revoke step and the export
  menu — the sharing demo and the decisions section are what get evaluated.
