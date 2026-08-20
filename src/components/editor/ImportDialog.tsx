"use client";

import clsx from "clsx";
import { CloudUpload, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorNote, Modal, Spinner } from "@/components/ui/primitives";
import { ApiClientError, api } from "@/lib/api-client";
import type { DocumentDetail } from "@/lib/api-types";
import { MAX_UPLOAD_BYTES } from "@/lib/content";
import {
  SUPPORTED_IMPORT_ACCEPT,
  SUPPORTED_IMPORT_EXTENSIONS,
  SUPPORTED_IMPORT_TYPES,
} from "@/lib/import";

type ImportMode = "append" | "replace";

const SIZE_LIMIT_LABEL = `${Math.round(MAX_UPLOAD_BYTES / 1_000_000)} MB`;

function extensionOf(filename: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filename.trim());
  return match ? match[0].toLowerCase() : "";
}

/** Cheap client-side gate so obvious mistakes never cost a round trip. */
function validate(file: File): string | null {
  const extension = extensionOf(file.name);
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as never)) {
    return `“${file.name}” is not a supported file type. Choose a ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")} file.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name}” is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is ${SIZE_LIMIT_LABEL}.`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  return null;
}

function ModeOption({
  value,
  mode,
  onChange,
  title,
  hint,
}: {
  value: ImportMode;
  mode: ImportMode;
  onChange: (next: ImportMode) => void;
  title: string;
  hint: string;
}) {
  const selected = mode === value;
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected ? "border-brand-500 bg-brand-50" : "border-line hover:bg-canvas",
      )}
    >
      <input
        type="radio"
        name="import-mode"
        className="mt-0.5 accent-brand-600"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
      />
      <span>
        <span className="block text-[13px] font-medium text-ink-900">{title}</span>
        <span className="block text-[12px] text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

export function ImportDialog({
  open,
  onClose,
  documentId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  onImported: (next: DocumentDetail, warnings: string[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  const choose = (next: File | null) => {
    setDragging(false);
    if (!next) return;
    const problem = validate(next);
    setError(problem);
    setFile(problem ? null : next);
  };

  const submit = async () => {
    if (!file) {
      setError("Choose a file to import.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.importIntoDocument(documentId, file, mode);
      onImported(result.document, result.warnings);
      setFile(null);
      setMode("append");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "That file could not be imported. Please try another file.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Import a file"
      description="Vellum converts the file on the server and keeps your current version in history."
    >
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            choose(event.dataTransfer.files[0] ?? null);
          }}
          className={clsx(
            "rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-brand-500 bg-brand-50" : "border-line bg-canvas",
          )}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-[13px] text-ink-900">
              <FileText className="size-4 text-ink-400" aria-hidden />
              <span className="max-w-[16rem] truncate font-medium">{file.name}</span>
              <span className="text-ink-500">
                {(file.size / 1000).toFixed(0)} KB
              </span>
              <button
                type="button"
                aria-label="Remove selected file"
                className="rounded-md p-1 text-ink-400 hover:bg-paper hover:text-ink-900"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <CloudUpload className="mx-auto mb-2 size-6 text-ink-400" aria-hidden />
              <p className="text-[13px] text-ink-700">
                Drag a file here, or{" "}
                <button
                  type="button"
                  className="font-medium text-brand-600 underline underline-offset-2"
                  onClick={() => inputRef.current?.click()}
                >
                  browse your computer
                </button>
              </p>
              <p className="mt-1 text-[12px] text-ink-500">
                {SUPPORTED_IMPORT_TYPES.map((type) => type.label).join(" · ")} — up to{" "}
                {SIZE_LIMIT_LABEL}
              </p>
            </>
          )}
          <label className="sr-only" htmlFor="import-file">
            File to import
          </label>
          <input
            id="import-file"
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={SUPPORTED_IMPORT_ACCEPT}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium text-ink-700">
            Where should it go?
          </legend>
          <ModeOption
            value="append"
            mode={mode}
            onChange={setMode}
            title="Append to the end of this document"
            hint="Your existing text stays exactly where it is."
          />
          <ModeOption
            value="replace"
            mode={mode}
            onChange={setMode}
            title="Replace the whole document"
            hint="The current text is saved to version history first."
          />
        </fieldset>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !file}>
            {busy ? <Spinner /> : null}
            {busy ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
