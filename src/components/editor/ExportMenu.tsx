"use client";

import clsx from "clsx";
import { ChevronDown, CodeXml, Download, FileText, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";

type ExportFormat = "md" | "txt" | "html";

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: "md", label: "Markdown (.md)", hint: "Headings and lists preserved", icon: FileText },
  { format: "txt", label: "Plain text (.txt)", hint: "Formatting removed", icon: FileText },
  { format: "html", label: "HTML", hint: "Standalone styled page", icon: CodeXml },
];

/**
 * Downloads are plain navigations so the browser handles the `Content-Disposition`
 * header itself — no blobs, no object URLs to revoke.
 */
export function ExportMenu({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export this document"
      >
        <Download className="size-4" aria-hidden />
        Export
        <ChevronDown
          className={clsx("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Export format"
          className="animate-fade-in absolute right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-paper p-1 shadow-lg"
        >
          {FORMATS.map(({ format, label, hint, icon: Icon }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
              onClick={() => {
                setOpen(false);
                window.location.assign(
                  `/api/documents/${documentId}/export?format=${format}`,
                );
              }}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
              <span>
                <span className="block text-[13px] font-medium text-ink-900">{label}</span>
                <span className="block text-[12px] text-ink-500">{hint}</span>
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
            onClick={() => {
              setOpen(false);
              window.print();
            }}
          >
            <Printer className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
            <span>
              <span className="block text-[13px] font-medium text-ink-900">
                Print / Save as PDF
              </span>
              <span className="block text-[12px] text-ink-500">Uses your print dialog</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
