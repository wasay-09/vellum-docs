"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, type Editor, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import { ArrowLeft, ClockFading, Eye, Share2, TriangleAlert, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentType, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Badge, Button, Spinner } from "@/components/ui/primitives";
import { ApiClientError, api } from "@/lib/api-client";
import type { DocumentDetail, PublicUser } from "@/lib/api-types";
import { EditorToolbar } from "./EditorToolbar";
import { ExportMenu } from "./ExportMenu";
import { ImportDialog } from "./ImportDialog";
import { ShareDialog } from "./ShareDialog";
import { VersionHistory } from "./VersionHistory";

const AUTOSAVE_DELAY_MS = 900;
const JUST_SAVED_MS = 4_000;

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function DocumentEditor({
  document: initial,
  currentUser,
}: {
  document: DocumentDetail;
  currentUser: PublicUser;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail>(initial);
  const [title, setTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"share" | "import" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const access = doc.access;
  const editorRef = useRef<Editor | null>(null);
  const savedHtml = useRef(initial.contentHtml);
  const savedTitle = useRef(initial.title);
  const titleRef = useRef(initial.title);
  const baseUpdatedAt = useRef(initial.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const paused = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const hasPendingChanges = useCallback(() => {
    const html = editorRef.current?.getHTML() ?? savedHtml.current;
    return html !== savedHtml.current || titleRef.current !== savedTitle.current;
  }, []);

  const schedule = useCallback((delay: number = AUTOSAVE_DELAY_MS) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, delay);
  }, []);

  /** One writer for every save path: debounce, ⌘S, blur, unmount. */
  const save = useCallback(async () => {
    if (paused.current || !access.canEdit) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const html = editorRef.current?.getHTML() ?? savedHtml.current;
    const body: { title?: string; contentHtml?: string; baseUpdatedAt: string } = {
      baseUpdatedAt: baseUpdatedAt.current,
    };
    if (html !== savedHtml.current) body.contentHtml = html;
    if (titleRef.current !== savedTitle.current) body.title = titleRef.current;
    if (body.contentHtml === undefined && body.title === undefined) {
      setSaveState((state) => (state === "dirty" ? "saved" : state));
      return;
    }
    // A save is already on the wire: let it land, then flush what came after it.
    if (inflight.current) {
      schedule(250);
      return;
    }

    inflight.current = true;
    setSaveState("saving");
    try {
      const { document: next } = await api.updateDocument(doc.id, body);
      if (body.contentHtml !== undefined) savedHtml.current = body.contentHtml;
      savedTitle.current = next.title;
      baseUpdatedAt.current = next.updatedAt;
      // Keep the local content: `next.contentHtml` is a round trip behind the caret.
      setDoc((prev) => ({ ...next, contentHtml: prev.contentHtml, access: prev.access }));
      setSaveError(null);
      setJustSaved(true);
      setSaveState(hasPendingChanges() ? "dirty" : "saved");
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "conflict") {
        paused.current = true;
        setSaveState("conflict");
      } else {
        setSaveError(
          cause instanceof ApiClientError
            ? cause.message
            : "Could not reach the server. Your text is still here.",
        );
        setSaveState("error");
      }
    } finally {
      inflight.current = false;
    }
  }, [access.canEdit, doc.id, hasPendingChanges, schedule]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder: "Start writing, or import a file…" }),
    ],
    content: initial.contentHtml,
    editable: initial.access.canEdit,
    immediatelyRender: false,
    editorProps: { attributes: { class: "doc-surface ProseMirror" } },
    onCreate: ({ editor: instance }) => {
      editorRef.current = instance;
      // Normalise against TipTap's own serialisation so a fresh doc is not "dirty".
      savedHtml.current = instance.getHTML();
    },
    onUpdate: () => {
      if (paused.current) return;
      setJustSaved(false);
      setSaveState((state) => (state === "saving" ? state : "dirty"));
      schedule();
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), JUST_SAVED_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!access.canEdit) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (paused.current || !hasPendingChanges()) return;
      void saveRef.current();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (!paused.current && hasPendingChanges()) void saveRef.current();
    };
  }, [access.canEdit, hasPendingChanges]);

  /** Adopts a document returned by import / restore / share. */
  const adopt = useCallback((next: DocumentDetail, replaceContent: boolean) => {
    if (replaceContent && editorRef.current) {
      editorRef.current.commands.setContent(next.contentHtml);
      savedHtml.current = editorRef.current.getHTML();
    }
    savedTitle.current = next.title;
    titleRef.current = next.title;
    baseUpdatedAt.current = next.updatedAt;
    setTitle(next.title);
    setDoc(next);
    paused.current = false;
    setSaveError(null);
    setSaveState("saved");
    setJustSaved(replaceContent);
    setHistoryKey((key) => key + 1);
  }, []);

  const reload = useCallback(async () => {
    try {
      const { document: fresh } = await api.getDocument(doc.id);
      adopt(fresh, true);
      router.refresh();
    } catch {
      setSaveError("Could not reload the document. Check your connection and try again.");
    }
  }, [adopt, doc.id, router]);

  const commitTitle = () => {
    const next = title.trim() || "Untitled document";
    if (next !== title) setTitle(next);
    titleRef.current = next;
    if (next !== savedTitle.current) {
      setSaveState("dirty");
      void saveRef.current();
    }
  };

  const isOwner = doc.role === "owner";
  const collaborators = doc.sharedWith.map((entry) => entry.user);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="print-hidden sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <Link
            href="/documents"
            title="Back to all documents"
            aria-label="Back to all documents"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-canvas hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {access.canRename ? (
                <>
                  <label className="sr-only" htmlFor="doc-title">
                    Document title
                  </label>
                  <input
                    id="doc-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setTitle(savedTitle.current);
                        event.currentTarget.blur();
                      }
                    }}
                    maxLength={200}
                    className="min-w-0 max-w-[22rem] flex-1 truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold text-ink-900 hover:border-line focus:border-brand-500 focus:outline-none"
                  />
                </>
              ) : (
                <h1 className="max-w-[22rem] truncate px-1 text-[15px] font-semibold text-ink-900">
                  {doc.title}
                </h1>
              )}
              {!isOwner ? (
                <Badge tone={access.canEdit ? "brand" : "neutral"}>
                  {access.canEdit ? "Can edit" : "View only"}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 px-1 text-[12px] text-ink-500">
              <SaveStatus state={saveState} justSaved={justSaved} editable={access.canEdit} />
              <span aria-hidden>·</span>
              <WordCount editor={editor} fallback={doc.wordCount} />
              {!isOwner ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="hidden truncate sm:inline">
                    Shared by {doc.owner.name}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {collaborators.length > 0 ? (
            <div className="hidden items-center pr-1 sm:flex">
              <AvatarStack owner={doc.owner} people={collaborators} />
            </div>
          ) : null}

          {access.canViewHistory ? (
            <Button
              size="sm"
              onClick={() => setHistoryOpen((value) => !value)}
              aria-pressed={historyOpen}
              title="Version history"
            >
              <ClockFading className="size-4" aria-hidden />
              <span className="hidden md:inline">History</span>
            </Button>
          ) : null}
          {access.canImport ? (
            <Button size="sm" onClick={() => setDialog("import")} title="Import a file">
              <Upload className="size-4" aria-hidden />
              <span className="hidden md:inline">Import</span>
            </Button>
          ) : null}
          <ExportMenu documentId={doc.id} />
          {access.canShare ? (
            <Button size="sm" variant="primary" onClick={() => setDialog("share")}>
              <Share2 className="size-4" aria-hidden />
              Share
            </Button>
          ) : null}
        </div>
      </header>

      {access.canEdit ? (
        <div className="print-hidden sticky top-14 z-20">
          <EditorToolbar editor={editor} />
        </div>
      ) : null}

      <div className="print-hidden">
        {saveState === "conflict" ? (
          <Banner tone="red" icon={TriangleAlert}>
            <span className="flex-1">
              This document was changed by someone else. Reload to see the latest version —
              autosave is paused so nothing gets overwritten.
            </span>
            <Button size="sm" onClick={() => void reload()}>
              Reload
            </Button>
          </Banner>
        ) : null}

        {saveState === "error" && saveError ? (
          <Banner tone="red" icon={TriangleAlert}>
            <span className="flex-1">{saveError}</span>
            <Button size="sm" onClick={() => void saveRef.current()}>
              Retry
            </Button>
          </Banner>
        ) : null}

        {!access.canEdit ? (
          <Banner tone="amber" icon={Eye}>
            <span className="flex-1">
              You have view-only access — ask {doc.owner.name} for edit access to make
              changes.
            </span>
          </Banner>
        ) : null}

        {warnings.length > 0 ? (
          <Banner tone="amber" icon={TriangleAlert}>
            <span className="flex-1">
              Imported with {warnings.length === 1 ? "a note" : "notes"}: {warnings.join(" · ")}
            </span>
            <button
              type="button"
              aria-label="Dismiss import notes"
              className="rounded-md p-1 hover:bg-amber-100"
              onClick={() => setWarnings([])}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </Banner>
        ) : null}
      </div>

      <main className="flex-1 px-3 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-[820px] rounded-xl border border-line bg-paper px-8 py-12 shadow-sm sm:px-14 sm:py-16">
          <EditorContent editor={editor} />
        </div>
      </main>

      <ShareDialog
        open={dialog === "share"}
        onClose={() => setDialog(null)}
        document={doc}
        onDocumentChange={(next) => adopt(next, false)}
      />
      <ImportDialog
        open={dialog === "import"}
        onClose={() => setDialog(null)}
        documentId={doc.id}
        onImported={(next, notes) => {
          adopt(next, true);
          setWarnings(notes);
        }}
      />
      <VersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        documentId={doc.id}
        canRestore={access.canRestoreVersion}
        onRestored={(next) => adopt(next, true)}
        reloadKey={historyKey}
      />
      <span className="sr-only">Signed in as {currentUser.name}</span>
    </div>
  );
}

function SaveStatus({
  state,
  justSaved,
  editable,
}: {
  state: SaveState;
  justSaved: boolean;
  editable: boolean;
}) {
  if (!editable) return <span>Read-only</span>;
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5">
        <Spinner className="size-3" /> Saving…
      </span>
    );
  }
  if (state === "dirty") return <span>Unsaved changes</span>;
  if (state === "conflict") return <span className="text-red-600">Autosave paused</span>;
  if (state === "error") return <span className="text-red-600">Save failed</span>;
  return <span>{justSaved ? "Saved just now" : "All changes saved"}</span>;
}

function WordCount({ editor, fallback }: { editor: Editor | null; fallback: number }) {
  const count = useEditorState({
    editor,
    selector: ({ editor: instance }) => (instance ? countWords(instance.getText()) : null),
  });
  const value = count ?? fallback;
  return <span>{value.toLocaleString()} words</span>;
}

function AvatarStack({ owner, people }: { owner: PublicUser; people: PublicUser[] }) {
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {[owner, ...shown].map((person, index) => (
        <span
          key={person.id}
          className={clsx("rounded-full ring-2 ring-paper", index > 0 && "-ml-1.5")}
        >
          <Avatar
            name={person.name}
            accent={person.accent}
            size={26}
            title={`${person.name} (${person.email})`}
          />
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-1.5 inline-flex size-[26px] items-center justify-center rounded-full bg-canvas text-[11px] font-semibold text-ink-500 ring-2 ring-paper">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "red" | "amber";
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={clsx(
        "flex items-center gap-2.5 border-b px-3 py-2 text-[13px] sm:px-6",
        tone === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </div>
  );
}
