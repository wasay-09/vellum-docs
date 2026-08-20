import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DocumentDetail, DocumentListResponse } from "@/lib/api-types";

/**
 * End-to-end API tests: they drive the real Next.js route handlers against a real
 * Postgres (PGlite, in-memory), with only the cookie store faked. That covers the
 * pieces most likely to break in a hurry — auth, access control, sanitisation,
 * upload conversion, optimistic concurrency and version history — without a browser.
 */
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const { POST: login } = await import("@/app/api/auth/login/route");
const { GET: listDocuments, POST: createDocument } = await import(
  "@/app/api/documents/route"
);
const {
  GET: getDocument,
  PATCH: patchDocument,
  DELETE: deleteDocument,
} = await import("@/app/api/documents/[id]/route");
const { POST: importAsNewDocument } = await import("@/app/api/documents/import/route");
const { POST: importIntoDocument } = await import(
  "@/app/api/documents/[id]/import/route"
);
const {
  POST: addShare,
  PATCH: updateShare,
  DELETE: revokeShare,
} = await import("@/app/api/documents/[id]/shares/route");
const { GET: listVersions, POST: restoreVersion } = await import(
  "@/app/api/documents/[id]/versions/route"
);
const { GET: exportDocument } = await import("@/app/api/documents/[id]/export/route");

const ALICE = "alice@ajaia.test";
const BOB = "bob@ajaia.test";
const CAROL = "carol@ajaia.test";
const PASSWORD = "demo1234";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(`http://test${url}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function fileRequest(
  url: string,
  filename: string,
  extra?: Record<string, string>,
): Promise<Request> {
  const bytes = await readFile(path.join(process.cwd(), "tests/fixtures", filename));
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], filename));
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return new Request(`http://test${url}`, { method: "POST", body: form });
}

async function signIn(email: string): Promise<void> {
  jar.clear();
  const response = await login(
    jsonRequest("/api/auth/login", "POST", { email, password: PASSWORD }),
  );
  expect(response.status, `sign-in for ${email}`).toBe(200);
}

async function documents(): Promise<DocumentListResponse> {
  const response = await listDocuments(jsonRequest("/api/documents", "GET"));
  expect(response.status).toBe(200);
  return response.json();
}

async function newDocument(title: string, contentHtml?: string): Promise<DocumentDetail> {
  const created = await createDocument(
    jsonRequest("/api/documents", "POST", { title }),
  );
  expect(created.status).toBe(201);
  let { document } = (await created.json()) as { document: DocumentDetail };
  if (contentHtml) {
    const patched = await patchDocument(
      jsonRequest(`/api/documents/${document.id}`, "PATCH", { contentHtml }),
      ctx(document.id),
    );
    expect(patched.status).toBe(200);
    document = ((await patched.json()) as { document: DocumentDetail }).document;
  }
  return document;
}

beforeAll(async () => {
  // First DB touch runs migrations + seed; do it once, loudly, before any test.
  await signIn(ALICE);
  const data = await documents();
  expect(data.owned.length).toBeGreaterThan(0);
});

describe("authentication", () => {
  it("rejects unauthenticated requests", async () => {
    jar.clear();
    const response = await listDocuments(jsonRequest("/api/documents", "GET"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const wrongPassword = await login(
      jsonRequest("/api/auth/login", "POST", { email: ALICE, password: "nope" }),
    );
    const unknownEmail = await login(
      jsonRequest("/api/auth/login", "POST", {
        email: "nobody@ajaia.test",
        password: PASSWORD,
      }),
    );
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json()).error.message).toBe(
      (await unknownEmail.json()).error.message,
    );
  });

  it("validates the login payload", async () => {
    const response = await login(jsonRequest("/api/auth/login", "POST", { email: "" }));
    expect(response.status).toBe(400);
  });
});

describe("document listing", () => {
  it("separates owned documents from shared ones and reports the role", async () => {
    await signIn(ALICE);
    const { owned, shared } = await documents();
    expect(owned.every((doc) => doc.role === "owner")).toBe(true);
    expect(owned.some((doc) => doc.title === "Welcome to Vellum")).toBe(true);
    const fromBob = shared.find((doc) => doc.owner.email === BOB);
    expect(fromBob?.role).toBe("viewer");
  });

  it("never leaks a document that was not shared", async () => {
    await signIn(CAROL);
    const carolDocs = await documents();
    const privateDoc = carolDocs.owned[0];
    expect(privateDoc).toBeDefined();

    await signIn(ALICE);
    const list = await documents();
    expect([...list.owned, ...list.shared].some((doc) => doc.id === privateDoc.id)).toBe(
      false,
    );
    const direct = await getDocument(
      jsonRequest(`/api/documents/${privateDoc.id}`, "GET"),
      ctx(privateDoc.id),
    );
    // 404 rather than 403: the API must not confirm that the document exists.
    expect(direct.status).toBe(404);
  });

  it("returns 404 for ids that are not documents", async () => {
    await signIn(ALICE);
    const response = await getDocument(
      jsonRequest("/api/documents/not-a-uuid", "GET"),
      ctx("not-a-uuid"),
    );
    expect(response.status).toBe(404);
  });
});

describe("editing and validation", () => {
  it("sanitises editor HTML before it is stored", async () => {
    await signIn(ALICE);
    const doc = await newDocument(
      "Sanitiser check",
      '<h1>Hi</h1><p onclick="steal()">text</p><script>alert(1)</script>',
    );
    expect(doc.contentHtml).toBe("<h1>Hi</h1><p>text</p>");
    expect(doc.wordCount).toBe(2);
    expect(doc.excerpt).toContain("Hi text");
  });

  it("falls back to a default title and trims whitespace", async () => {
    await signIn(ALICE);
    const doc = await newDocument("   ");
    expect(doc.title).toBe("Untitled document");
  });

  it("rejects an empty update payload", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Payload check");
    const response = await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", {}),
      ctx(doc.id),
    );
    expect(response.status).toBe(400);
  });

  it("detects a concurrent save instead of overwriting it", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Concurrency", "<p>first</p>");
    const staleStamp = doc.updatedAt;

    await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", {
        contentHtml: "<p>saved by another tab</p>",
      }),
      ctx(doc.id),
    );

    const conflicted = await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", {
        contentHtml: "<p>stale client</p>",
        baseUpdatedAt: staleStamp,
      }),
      ctx(doc.id),
    );
    expect(conflicted.status).toBe(409);
    expect((await conflicted.json()).error.code).toBe("conflict");

    const current = await getDocument(
      jsonRequest(`/api/documents/${doc.id}`, "GET"),
      ctx(doc.id),
    );
    const { document } = (await current.json()) as { document: DocumentDetail };
    expect(document.contentHtml).toBe("<p>saved by another tab</p>");
  });
});

describe("sharing", () => {
  it("grants edit access by email, then narrows and revokes it", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Shared plan", "<p>owned by alice</p>");

    const shared = await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: BOB,
        role: "editor",
      }),
      ctx(doc.id),
    );
    expect(shared.status).toBe(201);
    const { document: withShare } = (await shared.json()) as {
      document: DocumentDetail;
    };
    expect(withShare.sharedWith).toHaveLength(1);
    expect(withShare.sharedWith[0].role).toBe("editor");

    // Bob can now edit and rename, but cannot share or delete.
    await signIn(BOB);
    const bobEdit = await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", {
        contentHtml: "<p>bob edited this</p>",
        title: "Shared plan v2",
      }),
      ctx(doc.id),
    );
    expect(bobEdit.status).toBe(200);
    const { document: bobView } = (await bobEdit.json()) as { document: DocumentDetail };
    expect(bobView.role).toBe("editor");
    expect(bobView.access.canShare).toBe(false);
    // A non-owner never sees the collaborator list.
    expect(bobView.sharedWith).toHaveLength(0);

    const bobShare = await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: CAROL,
        role: "editor",
      }),
      ctx(doc.id),
    );
    expect(bobShare.status).toBe(403);
    const bobDelete = await deleteDocument(
      jsonRequest(`/api/documents/${doc.id}`, "DELETE"),
      ctx(doc.id),
    );
    expect(bobDelete.status).toBe(403);

    // Owner narrows Bob to viewer -> writes now fail.
    await signIn(ALICE);
    const narrowed = await updateShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "PATCH", {
        userId: withShare.sharedWith[0].user.id,
        role: "viewer",
      }),
      ctx(doc.id),
    );
    expect(narrowed.status).toBe(200);

    await signIn(BOB);
    const blocked = await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", { contentHtml: "<p>nope</p>" }),
      ctx(doc.id),
    );
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("forbidden");
    // ...but a viewer can still read and export.
    const readable = await getDocument(
      jsonRequest(`/api/documents/${doc.id}`, "GET"),
      ctx(doc.id),
    );
    expect(readable.status).toBe(200);

    // Revoking access hides the document entirely.
    await signIn(ALICE);
    const revoked = await revokeShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "DELETE", {
        userId: withShare.sharedWith[0].user.id,
      }),
      ctx(doc.id),
    );
    expect(revoked.status).toBe(200);

    await signIn(BOB);
    const gone = await getDocument(
      jsonRequest(`/api/documents/${doc.id}`, "GET"),
      ctx(doc.id),
    );
    expect(gone.status).toBe(404);
  });

  it("explains why an unknown email cannot be shared with", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Unknown invite");
    const response = await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: "stranger@example.com",
        role: "viewer",
      }),
      ctx(doc.id),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/No account with that email/);
  });

  it("refuses to share a document with its own owner", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Self share");
    const response = await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: ALICE,
        role: "editor",
      }),
      ctx(doc.id),
    );
    expect(response.status).toBe(400);
  });
});

describe("file import", () => {
  it("turns an uploaded .docx into a new document", async () => {
    await signIn(ALICE);
    const response = await importAsNewDocument(
      await fileRequest("/api/documents/import", "sample.docx"),
    );
    expect(response.status).toBe(201);
    const { document } = (await response.json()) as { document: DocumentDetail };
    expect(document.title).toBe("Quarterly Planning Notes");
    expect(document.contentHtml).toContain("<h1>Quarterly Planning Notes</h1>");
    expect(document.contentHtml).toContain("<strong>bold</strong>");
    expect(document.wordCount).toBeGreaterThan(5);
  });

  it("appends an import into an existing document", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Draft with import", "<p>existing text</p>");
    const response = await importIntoDocument(
      await fileRequest(`/api/documents/${doc.id}/import`, "sample.md", {
        mode: "append",
      }),
      ctx(doc.id),
    );
    expect(response.status).toBe(200);
    const { document } = (await response.json()) as { document: DocumentDetail };
    expect(document.contentHtml).toContain("existing text");
    expect(document.contentHtml).toContain("<h1>Launch checklist</h1>");
    expect(document.contentHtml).not.toContain("script");
  });

  it("replaces content when asked to", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Draft to replace", "<p>throw me away</p>");
    const response = await importIntoDocument(
      await fileRequest(`/api/documents/${doc.id}/import`, "sample.txt", {
        mode: "replace",
      }),
      ctx(doc.id),
    );
    const { document } = (await response.json()) as { document: DocumentDetail };
    expect(document.contentHtml).not.toContain("throw me away");
    expect(document.contentHtml).toContain("Meeting notes");
  });

  it("rejects an unsupported file type with 415", async () => {
    await signIn(ALICE);
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "contract.pdf"));
    const response = await importAsNewDocument(
      new Request("http://test/api/documents/import", { method: "POST", body: form }),
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error.message).toMatch(/Supported/);
  });

  it("rejects an import from a viewer", async () => {
    await signIn(BOB);
    const { shared } = await documents();
    const bobsViewOnly = shared.find((doc) => doc.role === "viewer");
    if (!bobsViewOnly) return;
    const response = await importIntoDocument(
      await fileRequest(`/api/documents/${bobsViewOnly.id}/import`, "sample.md"),
      ctx(bobsViewOnly.id),
    );
    expect(response.status).toBe(403);
  });
});

describe("version history", () => {
  it("snapshots collaborator edits without spamming a version per keystroke", async () => {
    await signIn(ALICE);
    const doc = await newDocument("History", "<p>alice original</p>");
    await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: BOB,
        role: "editor",
      }),
      ctx(doc.id),
    );

    // Rapid autosaves from the same author collapse into one snapshot.
    for (const text of ["one", "two", "three"]) {
      await patchDocument(
        jsonRequest(`/api/documents/${doc.id}`, "PATCH", {
          contentHtml: `<p>alice ${text}</p>`,
        }),
        ctx(doc.id),
      );
    }
    const afterAlice = await listVersions(
      jsonRequest(`/api/documents/${doc.id}/versions`, "GET"),
      ctx(doc.id),
    );
    const aliceVersions = (await afterAlice.json()).versions;
    expect(aliceVersions).toHaveLength(1);
    expect(aliceVersions[0].author.email).toBe(ALICE);

    // A different author always gets its own snapshot of what came before.
    await signIn(BOB);
    await patchDocument(
      jsonRequest(`/api/documents/${doc.id}`, "PATCH", {
        contentHtml: "<p>bob rewrote it</p>",
      }),
      ctx(doc.id),
    );

    await signIn(ALICE);
    const listed = await listVersions(
      jsonRequest(`/api/documents/${doc.id}/versions`, "GET"),
      ctx(doc.id),
    );
    const versions = (await listed.json()).versions;
    expect(versions.length).toBe(2);

    const restorable = versions.find(
      (version: { author: { email: string } }) => version.author.email === BOB,
    );
    const restored = await restoreVersion(
      jsonRequest(`/api/documents/${doc.id}/versions`, "POST", {
        versionId: restorable.id,
      }),
      ctx(doc.id),
    );
    expect(restored.status).toBe(200);
    const { document } = (await restored.json()) as { document: DocumentDetail };
    expect(document.contentHtml).toBe("<p>alice three</p>");

    // Restoring is itself undoable: the pre-restore state is snapshotted.
    const afterRestore = await listVersions(
      jsonRequest(`/api/documents/${doc.id}/versions`, "GET"),
      ctx(doc.id),
    );
    const reasons = (await afterRestore.json()).versions.map(
      (version: { reason: string }) => version.reason,
    );
    expect(reasons).toContain("restore");
  });
});

describe("export", () => {
  it("exports markdown as a download", async () => {
    await signIn(ALICE);
    const doc = await newDocument(
      "Export me",
      "<h1>Export me</h1><p><strong>bold</strong></p><ul><li>a</li><li>b</li></ul>",
    );
    const response = await exportDocument(
      new Request(`http://test/api/documents/${doc.id}/export?format=md`),
      ctx(doc.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("export-me.md");
    const body = await response.text();
    expect(body).toContain("# Export me");
    expect(body).toContain("**bold**");
    expect(body).toContain("-   a");
  });

  it("rejects an unknown export format", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Format check");
    const response = await exportDocument(
      new Request(`http://test/api/documents/${doc.id}/export?format=pdf`),
      ctx(doc.id),
    );
    expect(response.status).toBe(400);
  });
});

describe("deletion", () => {
  it("lets only the owner delete, and hides it from collaborators afterwards", async () => {
    await signIn(ALICE);
    const doc = await newDocument("Delete me", "<p>bye</p>");
    await addShare(
      jsonRequest(`/api/documents/${doc.id}/shares`, "POST", {
        email: BOB,
        role: "editor",
      }),
      ctx(doc.id),
    );

    const removed = await deleteDocument(
      jsonRequest(`/api/documents/${doc.id}`, "DELETE"),
      ctx(doc.id),
    );
    expect(removed.status).toBe(204);

    const afterOwner = await getDocument(
      jsonRequest(`/api/documents/${doc.id}`, "GET"),
      ctx(doc.id),
    );
    expect(afterOwner.status).toBe(404);

    await signIn(BOB);
    const { shared } = await documents();
    expect(shared.some((entry) => entry.id === doc.id)).toBe(false);
  });
});
