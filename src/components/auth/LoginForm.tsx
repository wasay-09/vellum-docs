"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-users";
import { Avatar, Button, ErrorNote, Spinner, TextInput } from "@/components/ui/primitives";

/** One place that turns an API failure into something a human can act on. */
function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "unauthorized") {
      return "That email and password don't match a demo account.";
    }
    return error.message;
  }
  return "Could not reach the server. Please try again.";
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** `null` when idle, otherwise the email being signed in — drives every spinner. */
  const [pending, setPending] = useState<string | null>(null);

  async function signIn(nextEmail: string, nextPassword: string) {
    if (pending) return;
    setPending(nextEmail);
    setError(null);
    try {
      await api.login(nextEmail, nextPassword);
      router.push(next ?? "/documents");
      // Refresh so server components pick up the new session cookie.
      router.refresh();
    } catch (caught) {
      setError(messageFor(caught));
      setPending(null);
    }
  }

  function signInAsDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void signIn(demoEmail, DEMO_PASSWORD);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600">
          <FileText className="size-4.5 text-white" aria-hidden />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-ink-900">
          Vellum
        </span>
      </div>

      <h1 className="text-xl font-semibold tracking-tight text-ink-900">
        Sign in to Vellum
      </h1>
      <p className="mt-1 text-[13px] text-ink-500">
        Pick a demo account below, or type the credentials yourself.
      </p>

      <form
        className="mt-6 space-y-4 rounded-xl border border-line bg-paper p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn(email.trim(), password);
        }}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="login-email"
            className="block text-[13px] font-medium text-ink-700"
          >
            Email
          </label>
          <TextInput
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@ajaia.test"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="login-password"
            className="block text-[13px] font-medium text-ink-700"
          >
            Password
          </label>
          <TextInput
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={pending !== null}>
          {pending ? <Spinner /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          Demo accounts
        </h2>
        <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {DEMO_USERS.map((demo) => (
            <li key={demo.email}>
              <button
                type="button"
                onClick={() => signInAsDemo(demo.email)}
                disabled={pending !== null}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Avatar name={demo.name} accent={demo.accent} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium text-ink-900">
                      {demo.name}
                    </span>
                    <span className="truncate text-[12px] text-ink-400">
                      {demo.email}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                    {demo.blurb}
                  </span>
                </span>
                {pending === demo.email ? (
                  <Spinner className="text-ink-400" />
                ) : (
                  <span className="shrink-0 text-[12px] font-medium text-brand-600">
                    Sign in
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] text-ink-400">
          Every demo account shares the password{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
            {DEMO_PASSWORD}
          </code>
          .
        </p>
      </div>
    </div>
  );
}
