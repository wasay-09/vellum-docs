"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText, LogOut } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PublicUser } from "@/lib/api-types";
import { Avatar, Spinner } from "@/components/ui/primitives";

export function AppHeader({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api.logout();
    } finally {
      setOpen(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/documents"
          className="flex items-center gap-2.5 rounded-lg"
          aria-label="Vellum — all documents"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600">
            <FileText className="size-4 text-white" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">
            Vellum
          </span>
        </Link>

        <div className="flex-1" />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-canvas"
          >
            <Avatar name={user.name} accent={user.accent} size={26} />
            <span className="hidden text-[13px] font-medium text-ink-700 sm:block">
              {user.name}
            </span>
            <ChevronDown className="size-3.5 text-ink-400" aria-hidden />
          </button>

          {open ? (
            <div
              role="menu"
              aria-label="Account"
              className="animate-fade-in absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-line bg-paper shadow-lg"
            >
              <div className="border-b border-line px-3.5 py-3">
                <p className="truncate text-[13px] font-medium text-ink-900">
                  {user.name}
                </p>
                <p className="truncate text-[12px] text-ink-500">{user.email}</p>
                <p className="mt-1.5 text-[11px] text-ink-400">
                  Signed in as a seeded demo account
                </p>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-60"
                >
                  {signingOut ? (
                    <Spinner className="text-ink-400" />
                  ) : (
                    <LogOut className="size-3.5 text-ink-400" aria-hidden />
                  )}
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
