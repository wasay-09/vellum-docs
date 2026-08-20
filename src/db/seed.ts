import type { Db } from "./client";
import { DEMO_PASSWORD, DEMO_USERS as DEMO_ACCOUNTS } from "@/lib/demo-users";
import { hashPassword } from "@/lib/password";
import { documentShares, documents, users } from "./schema";

const SEED_ACCOUNTS = DEMO_ACCOUNTS.map(({ email, name, accent }) => ({
  email,
  name,
  accent,
}));

const WELCOME_HTML = `<h1>Welcome to Vellum</h1>
<p>Vellum is a lightweight collaborative document editor: create a doc, format it, import a file, then share it with a teammate as a <strong>viewer</strong> or an <strong>editor</strong>.</p>
<h2>Try this in 60 seconds</h2>
<ol><li>Type below — autosave runs while you write.</li><li>Use <strong>Import</strong> to pull in a <code>.docx</code>, <code>.md</code> or <code>.txt</code> file.</li><li>Hit <strong>Share</strong> and give Bob edit access.</li></ol>
<h2>Formatting that works</h2>
<p><strong>Bold</strong>, <em>italic</em>, <u>underline</u>, headings, bulleted and numbered lists, quotes and inline code.</p>
<ul><li>Everything is persisted as sanitised HTML</li><li>Every save keeps a version you can restore</li></ul>
<blockquote><p>Scope note: this is a product slice, not a Google Docs clone. See the README for what was deliberately left out.</p></blockquote>`;

const SPEC_HTML = `<h1>Q3 Onboarding Revamp — Draft</h1>
<p>Owner: Bob. Alice has <strong>view-only</strong> access, which is what read-only mode in the editor demonstrates.</p>
<h2>Problem</h2>
<p>New teams take too long to reach their first shared document. We want time-to-first-doc under two minutes.</p>
<h2>Proposal</h2>
<ul><li>Seeded workspace with a starter doc</li><li>Import from existing files instead of copy-paste</li><li>One-click sharing with explicit roles</li></ul>
<h2>Open questions</h2>
<ol><li>Do we need comment threads before launch?</li><li>How do we handle simultaneous editing?</li></ol>`;

const PRIVATE_HTML = `<h1>Carol's private notes</h1>
<p>This document is intentionally shared with nobody. It exists so the access-control behaviour is demonstrable: signed in as Alice or Bob, this document must not appear anywhere and requesting it directly must return 404.</p>`;

function excerptOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function wordCountOf(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

/**
 * Idempotent: safe to run on every boot of the zero-setup PGlite path and safe to
 * re-run against a deployed database.
 */
export async function seedDatabase(db: Db): Promise<{ created: boolean }> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return { created: false };

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const inserted = await db
    .insert(users)
    .values(SEED_ACCOUNTS.map((user) => ({ ...user, passwordHash })))
    .returning();

  const byEmail = new Map(inserted.map((user) => [user.email, user]));
  const alice = byEmail.get("alice@ajaia.test")!;
  const bob = byEmail.get("bob@ajaia.test")!;
  const carol = byEmail.get("carol@ajaia.test")!;

  const docs = await db
    .insert(documents)
    .values([
      {
        ownerId: alice.id,
        title: "Welcome to Vellum",
        contentHtml: WELCOME_HTML,
        excerpt: excerptOf(WELCOME_HTML),
        wordCount: wordCountOf(WELCOME_HTML),
        updatedById: alice.id,
      },
      {
        ownerId: bob.id,
        title: "Q3 Onboarding Revamp — Draft",
        contentHtml: SPEC_HTML,
        excerpt: excerptOf(SPEC_HTML),
        wordCount: wordCountOf(SPEC_HTML),
        updatedById: bob.id,
      },
      {
        ownerId: carol.id,
        title: "Carol's private notes",
        contentHtml: PRIVATE_HTML,
        excerpt: excerptOf(PRIVATE_HTML),
        wordCount: wordCountOf(PRIVATE_HTML),
        updatedById: carol.id,
      },
    ])
    .returning();

  const welcome = docs.find((doc) => doc.ownerId === alice.id)!;
  const spec = docs.find((doc) => doc.ownerId === bob.id)!;

  await db.insert(documentShares).values([
    // Alice shares her welcome doc with Bob as an editor...
    { documentId: welcome.id, userId: bob.id, role: "editor", createdById: alice.id },
    // ...and Bob shares his draft with Alice read-only.
    { documentId: spec.id, userId: alice.id, role: "viewer", createdById: bob.id },
  ]);

  void carol;
  return { created: true };
}
