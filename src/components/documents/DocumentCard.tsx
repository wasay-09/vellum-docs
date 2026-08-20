"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { DocumentSummary, PublicUser } from "@/lib/api-types";
import { Avatar, Badge, TextInput, relativeTime } from "@/components/ui/primitives";

export const UNTITLED = "Untitled document";

const MAX_STACKED_AVATARS = 3;

function wordLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "word" : "words"}`;
}

/** Avatars of the people an owned document is shared with, capped with a "+N". */
function Collaborators({ people }: { people: PublicUser[] }) {
  const shown = people.slice(0, MAX_STACKED_AVATARS);
  const overflow = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((person) => (
        <span key={person.id} className="-ml-1.5 rounded-full ring-2 ring-paper first:ml-0">
          <Avatar name={person.name} accent={person.accent} size={22} />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="-ml-1.5 inline-flex size-[22px] items-center justify-center rounded-full bg-canvas text-[10px] font-semibold text-ink-500 ring-2 ring-paper">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function RoleBadge({ role }: { role: DocumentSummary["role"] }) {
  if (role === "editor") return <Badge tone="brand">Can edit</Badge>;
  if (role === "viewer") return <Badge tone="muted">View only</Badge>;
  return null;
}

export function DocumentCard({
  doc,
  currentUser,
  onRename,
  onRequestDelete,
}: {
  doc: DocumentSummary;
  currentUser: PublicUser;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (doc: DocumentSummary) => void;
}) {
  const isOwner = doc.role === "owner";
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(doc.title);
  /** Guards the blur-to-save path so Escape (and a completed save) cannot double-fire. */
  const settled = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function startRename() {
    setMenuOpen(false);
    setDraft(doc.title);
    settled.current = false;
    setRenaming(true);
  }

  function cancelRename() {
    settled.current = true;
    setRenaming(false);
  }

  function commitRename() {
    if (settled.current) return;
    settled.current = true;
    setRenaming(false);
    const title = draft.trim() || UNTITLED;
    if (title !== doc.title) onRename(doc.id, title);
  }

  const editor = doc.lastEditedBy;
  const editedBy = editor && editor.id !== currentUser.id ? ` by ${editor.name}` : "";
  const collaborators = doc.sharedWith.map((share) => share.user);

  return (
    <article className="group relative flex flex-col rounded-xl border border-line bg-paper p-4 transition-all hover:border-line-strong hover:shadow-md">
      {renaming ? null : (
        <Link
          href={`/documents/${doc.id}`}
          className="absolute inset-0 z-0 rounded-xl"
          aria-label={`Open ${doc.title || UNTITLED}`}
        />
      )}

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
        <div className="flex items-start gap-1.5">
          {renaming ? (
            <div className="pointer-events-auto min-w-0 flex-1">
              <TextInput
                autoFocus
                value={draft}
                aria-label={`Rename ${doc.title || UNTITLED}`}
                className="h-8 text-[13px]"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
              />
              <p className="mt-1 text-[11px] text-ink-400">
                Enter to save · Esc to cancel
              </p>
            </div>
          ) : (
            <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-5 text-ink-900">
              {doc.title || UNTITLED}
            </h3>
          )}

          {isOwner && !renaming ? (
            <div className="pointer-events-auto relative shrink-0" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Actions for ${doc.title || UNTITLED}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen((value) => !value);
                }}
                className="flex size-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-paper p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      startRename();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-700 transition-colors hover:bg-canvas hover:text-ink-900"
                  >
                    <Pencil className="size-3.5 text-ink-400" aria-hidden />
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenuOpen(false);
                      onRequestDelete(doc);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-ink-500">
          {doc.excerpt || <span className="text-ink-400">Empty document</span>}
        </p>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-ink-400">
              Edited {relativeTime(doc.updatedAt)}
              {editedBy} · {wordLabel(doc.wordCount)}
            </p>
            {!isOwner ? (
              <p className="mt-0.5 truncate text-[12px] text-ink-500">
                Shared by {doc.owner.name}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isOwner ? (
              collaborators.length > 0 ? (
                <>
                  <Collaborators people={collaborators} />
                  <Badge tone="neutral">Shared</Badge>
                </>
              ) : null
            ) : (
              <RoleBadge role={doc.role} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
