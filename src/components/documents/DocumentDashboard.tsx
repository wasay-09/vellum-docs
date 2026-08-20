"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus, Search } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";
import type { DocumentListResponse, DocumentSummary, PublicUser } from "@/lib/api-types";
import { MAX_UPLOAD_BYTES } from "@/lib/content";
import {
  SUPPORTED_IMPORT_ACCEPT,
  SUPPORTED_IMPORT_EXTENSIONS,
  SUPPORTED_IMPORT_TYPES,
  extensionOf,
} from "@/lib/import";
import { Button, ErrorNote, Modal, Spinner, TextInput } from "@/components/ui/primitives";
import { DocumentCard, UNTITLED } from "./DocumentCard";

type Tab = "owned" | "shared";

const SUPPORTED_LABELS = SUPPORTED_IMPORT_TYPES.map((type) => type.label).join(", ");
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1_000_000;

function describe(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

/** Client-side pre-flight so an obviously bad file never costs a round trip. */
function validateUpload(file: File): string | null {
  const extensions: readonly string[] = SUPPORTED_IMPORT_EXTENSIONS;
  if (!extensions.includes(extensionOf(file.name))) {
    return `“${file.name}” is not a supported file type. Supported: ${SUPPORTED_LABELS}.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1_000_000).toFixed(1);
    return `“${file.name}” is ${mb} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

function TabButton(props: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={props.id}
      role="tab"
      aria-selected={props.active}
      aria-controls="document-panel"
      onClick={props.onClick}
      className={`-mb-px border-b-2 px-0.5 pb-2.5 text-[13px] font-medium transition-colors ${
        props.active
          ? "border-brand-600 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-900"
      }`}
    >
      {props.children}
    </button>
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-paper/60 px-6 py-16 text-center">
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-500">{body}</p>
      {children ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export function DocumentDashboard({
  initialData,
  currentUser,
}: {
  initialData: DocumentListResponse;
  currentUser: PublicUser;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("owned");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  async function createDocument() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { document: created } = await api.createDocument();
      router.push(`/documents/${created.id}`);
    } catch (caught) {
      setError(describe(caught, "Could not create a document. Please try again."));
      setCreating(false);
    }
  }

  async function importFile(file: File) {
    const invalid = validateUpload(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const { document: imported } = await api.importNewDocument(file);
      router.push(`/documents/${imported.id}`);
    } catch (caught) {
      setError(describe(caught, "That file could not be imported."));
      setImporting(false);
    }
  }

  /** Optimistic: the new title paints immediately and rolls back if the save fails. */
  async function renameDocument(id: string, title: string) {
    const previous = data;
    setError(null);
    setData({
      ...previous,
      owned: previous.owned.map((doc) => (doc.id === id ? { ...doc, title } : doc)),
    });
    try {
      await api.updateDocument(id, { title });
    } catch (caught) {
      setData(previous);
      setError(describe(caught, "Could not rename that document."));
    }
  }

  async function deleteDocument(doc: DocumentSummary) {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteDocument(doc.id);
      setData((current) => ({
        ...current,
        owned: current.owned.filter((candidate) => candidate.id !== doc.id),
      }));
      setPendingDelete(null);
    } catch (caught) {
      setError(describe(caught, `Could not delete “${doc.title || UNTITLED}”.`));
    } finally {
      setDeleting(false);
    }
  }

  const openFilePicker = () => fileRef.current?.click();
  const list = tab === "owned" ? data.owned : data.shared;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? list.filter((doc) => `${doc.title} ${doc.excerpt}`.toLowerCase().includes(needle))
    : list;

  const importButton = (
    <Button onClick={openFilePicker} disabled={importing} title={`Supported: ${SUPPORTED_LABELS}`}>
      {importing ? <Spinner /> : <FileUp className="size-4" aria-hidden />}
      {importing ? "Importing…" : "Import file"}
    </Button>
  );
  const newButton = (
    <Button variant="primary" onClick={() => void createDocument()} disabled={creating}>
      {creating ? <Spinner /> : <Plus className="size-4" aria-hidden />}
      New document
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Documents</h1>
          <p className="mt-0.5 text-[13px] text-ink-500">
            Everything you own, plus anything a teammate has shared with you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <label htmlFor="document-search" className="sr-only">
              Search documents
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <TextInput
              id="document-search"
              type="search"
              placeholder="Search documents"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9 sm:w-60"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={SUPPORTED_IMPORT_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
          {importButton}
          {newButton}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6 border-b border-line" role="tablist">
        <TabButton id="tab-owned" active={tab === "owned"} onClick={() => setTab("owned")}>
          Owned by me ({data.owned.length})
        </TabButton>
        <TabButton id="tab-shared" active={tab === "shared"} onClick={() => setTab("shared")}>
          Shared with me ({data.shared.length})
        </TabButton>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <div className="mt-6" role="tabpanel" id="document-panel" aria-labelledby={`tab-${tab}`}>
        {visible.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                currentUser={currentUser}
                onRename={(id, title) => void renameDocument(id, title)}
                onRequestDelete={(target) => {
                  setError(null);
                  setPendingDelete(target);
                }}
              />
            ))}
          </div>
        ) : list.length > 0 ? (
          <EmptyState title="No matches" body={`No documents match “${query.trim()}”.`} />
        ) : tab === "owned" ? (
          <EmptyState
            title="No documents yet"
            body="Start from a blank page, or bring in a Word, Markdown or text file you already have."
          >
            {newButton}
            {importButton}
          </EmptyState>
        ) : (
          <EmptyState
            title="Nothing shared with you yet"
            body="Ask a teammate to share a document, or sign in as another demo account."
          />
        )}
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title || UNTITLED}”?`}
        description="This cannot be undone."
        width="max-w-md"
      >
        <p className="text-[13px] leading-relaxed text-ink-500">
          The document and its version history will be removed for you and for everyone it
          was shared with.
        </p>
        {error ? (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => {
              if (pendingDelete) void deleteDocument(pendingDelete);
            }}
          >
            {deleting ? <Spinner /> : null}
            {deleting ? "Deleting…" : "Delete document"}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
