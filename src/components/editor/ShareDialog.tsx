"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Avatar, Badge, Button, ErrorNote, Modal, Spinner, TextInput } from "@/components/ui/primitives";
import { ApiClientError, api } from "@/lib/api-client";
import type { DocumentDetail, PublicUser } from "@/lib/api-types";
import type { ShareRole } from "@/lib/permissions";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  document: DocumentDetail;
  onDocumentChange: (next: DocumentDetail) => void;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Something went wrong. Please try again.";
}

const ROLE_SELECT_CLASS =
  "h-8 rounded-lg border border-line bg-paper px-2 text-[13px] text-ink-700 focus:border-brand-500 focus:outline-none disabled:opacity-50";

function PersonRow({
  user,
  children,
}: {
  user: PublicUser;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={user.name} accent={user.accent} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink-900">{user.name}</span>
        <span className="block truncate text-[12px] text-ink-500">{user.email}</span>
      </span>
      {children}
    </li>
  );
}

export function ShareDialog({ open, onClose, document: doc, onDocumentChange }: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [people, setPeople] = useState<PublicUser[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || people) return;
    let cancelled = false;
    api
      .listUsers()
      .then(({ users }) => {
        if (!cancelled) setPeople(users);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, people]);

  const run = async (key: string, action: () => Promise<{ document: DocumentDetail }>) => {
    setBusy(key);
    setError(null);
    try {
      const { document: next } = await action();
      onDocumentChange(next);
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter an email address to share with.");
      return;
    }
    const ok = await run("invite", () => api.shareDocument(doc.id, trimmed, role));
    if (ok) setEmail("");
  };

  const taken = new Set([doc.owner.email, ...doc.sharedWith.map((entry) => entry.user.email)]);
  const suggestions = (people ?? []).filter((person) => !taken.has(person.email));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share this document"
      description="People you add can open it from their dashboard."
      width="max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="share-email"
            className="mb-1.5 block text-[13px] font-medium text-ink-700"
          >
            Invite by email
          </label>
          <div className="flex gap-2">
            <TextInput
              id="share-email"
              type="email"
              autoComplete="off"
              placeholder="teammate@vellum.test"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void invite();
                }
              }}
            />
            <select
              aria-label="Role for the invited person"
              className="h-9.5 shrink-0 rounded-lg border border-line bg-paper px-2 text-sm text-ink-700 focus:border-brand-500 focus:outline-none"
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button
              variant="primary"
              className="shrink-0"
              onClick={() => void invite()}
              disabled={busy !== null}
            >
              {busy === "invite" ? <Spinner /> : null}
              Share
            </Button>
          </div>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {suggestions.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[12px] font-medium tracking-wide text-ink-400 uppercase">
              Seeded demo accounts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => {
                    setEmail(person.email);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2 py-1 text-[12px] text-ink-700 hover:border-line-strong hover:text-ink-900"
                >
                  <Avatar name={person.name} accent={person.accent} size={18} />
                  {person.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-line pt-2">
          <p className="mb-1 text-[12px] font-medium tracking-wide text-ink-400 uppercase">
            People with access
          </p>
          <ul className="divide-y divide-line">
            <PersonRow user={doc.owner}>
              <Badge tone="brand">Owner</Badge>
            </PersonRow>

            {doc.sharedWith.map(({ user, role: shareRole }) => (
              <PersonRow key={user.id} user={user}>
                <select
                  aria-label={`Role for ${user.name}`}
                  className={ROLE_SELECT_CLASS}
                  value={shareRole}
                  disabled={busy !== null}
                  onChange={(event) =>
                    void run(user.id, () =>
                      api.updateShare(doc.id, user.id, event.target.value as ShareRole),
                    )
                  }
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 px-0"
                  title={`Remove ${user.name}`}
                  aria-label={`Remove ${user.name}`}
                  disabled={busy !== null}
                  onClick={() => void run(user.id, () => api.removeShare(doc.id, user.id))}
                >
                  {busy === user.id ? <Spinner /> : <X className="size-4" aria-hidden />}
                </Button>
              </PersonRow>
            ))}
          </ul>

          {doc.sharedWith.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-500">
              Not shared with anyone yet.
            </p>
          ) : null}
        </div>

        <p className="rounded-lg bg-canvas px-3 py-2 text-[12px] leading-relaxed text-ink-500">
          Editors can edit and import. Viewers can read and export. Only the owner can share
          or delete.
        </p>
      </div>
    </Modal>
  );
}
