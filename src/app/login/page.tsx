import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, FileUp, History, Type, Users } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in — Vellum",
};

const FEATURES = [
  {
    icon: Type,
    title: "Rich-text editing",
    body: "Headings, lists, quotes, links and inline code with keyboard shortcuts.",
  },
  {
    icon: FileUp,
    title: "Import what you already have",
    body: "Drop in a .docx, .md or .txt file and keep writing where you left off.",
  },
  {
    icon: Users,
    title: "Viewer and editor sharing",
    body: "Invite a teammate as a viewer or an editor — access is enforced server-side.",
  },
  {
    icon: History,
    title: "Version history",
    body: "Every meaningful change is snapshotted, so any edit can be rolled back.",
  },
] as const;

/** `next` is echoed back into the form so a deep link survives the sign-in hop. */
function safeNext(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return undefined;
  // Only allow same-origin paths — never an absolute URL or a protocol-relative one.
  return /^\/(?!\/)/.test(candidate) ? candidate : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/documents");

  const { next } = await searchParams;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <section className="hidden bg-ink-900 px-12 py-14 lg:flex lg:w-[46%] lg:flex-col xl:px-16">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600">
            <FileText className="size-4.5 text-white" aria-hidden />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            Vellum
          </span>
        </div>

        <div className="mt-auto max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Documents your team can actually work in together.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-400">
            A lightweight collaborative editor — write, format, import and share
            without the setup.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5">
                  <Icon className="size-3.5 text-brand-100" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-400">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-auto pt-14 text-[12px] text-ink-500">
          Seeded with demo accounts and sample documents — no signup required.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <LoginForm next={safeNext(next)} />
      </section>
    </div>
  );
}
