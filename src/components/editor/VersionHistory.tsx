"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, ErrorNote, Spinner, relativeTime } from "@/components/ui/primitives";
import { ApiClientError, api } from "@/lib/api-client";
import type { DocumentDetail, DocumentVersionSummary } from "@/lib/api-types";

const REASON_LABELS: Record<string, string> = {
  edit: "Edit",
  import: "Import",
  restore: "Restore",
};

const REASON_TONES: Record<string, string> = {
  edit: "bg-canvas text-ink-500 border-line",
  import: "bg-brand-50 text-brand-700 border-brand-100",
  restore: "bg-amber-50 text-amber-700 border-amber-200",
};

function ReasonChip({ reason }: { reason: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
        REASON_TONES[reason] ?? REASON_TONES.edit,
      )}
    >
      {REASON_LABELS[reason] ?? reason}
    </span>
  );
}

export function VersionHistory({
  open,
  onClose,
  documentId,
  canRestore,
  onRestored,
  reloadKey = 0,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  canRestore: boolean;
  onRestored: (next: DocumentDetail) => void;
  /** Bump to refetch — e.g. after a save or an import created a new snapshot. */
  reloadKey?: number;
}) {
  const [versions, setVersions] = useState<DocumentVersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { versions: rows } = await api.listVersions(documentId);
      setVersions(rows);
    } catch (cause) {
      setVersions([]);
      setError(
        cause instanceof ApiClientError ? cause.message : "Could not load version history.",
      );
    }
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    setConfirming(null);
    void load();
  }, [open, reloadKey, load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const restore = async (versionId: string) => {
    setBusy(versionId);
    setError(null);
    try {
      const { document: next } = await api.restoreVersion(documentId, versionId);
      onRestored(next);
      setConfirming(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Could not restore that version.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div
        className="print-hidden fixed inset-0 z-40 bg-ink-900/20 lg:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Version history"
        className="print-hidden animate-fade-in fixed inset-y-0 right-0 z-40 flex w-[360px] max-w-[92vw] flex-col border-l border-line bg-paper shadow-xl lg:shadow-none"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Version history</h2>
            <p className="text-[12px] text-ink-500">Most recent first</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 px-0"
            onClick={onClose}
            aria-label="Close version history"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="mb-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}

          {versions === null ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-ink-500">
              <Spinner /> Loading history…
            </p>
          ) : versions.length === 0 && !error ? (
            <p className="py-6 text-[13px] leading-relaxed text-ink-500">
              No history yet — versions are captured as you edit.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="rounded-lg border border-line px-3 py-2.5 hover:border-line-strong"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink-900">
                      {relativeTime(version.createdAt)}
                    </span>
                    <ReasonChip reason={version.reason} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-500">
                    {version.author ? (
                      <>
                        <Avatar
                          name={version.author.name}
                          accent={version.author.accent}
                          size={18}
                        />
                        <span className="truncate">{version.author.name}</span>
                      </>
                    ) : (
                      <span>Unknown author</span>
                    )}
                    <span aria-hidden>·</span>
                    <span>{version.wordCount.toLocaleString()} words</span>
                  </div>

                  {canRestore ? (
                    confirming === version.id ? (
                      <div className="mt-2 rounded-lg bg-canvas px-2.5 py-2">
                        <p className="text-[12px] leading-relaxed text-ink-700">
                          Restore this version? The current text is saved to history first.
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy !== null}
                            onClick={() => void restore(version.id)}
                          >
                            {busy === version.id ? <Spinner /> : null}
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1.5 -ml-2.5"
                        onClick={() => setConfirming(version.id)}
                      >
                        Restore
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
