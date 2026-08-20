import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { getDb } from "@/db/client";
import { loadDocumentForUser } from "@/db/queries";
import type { DocumentDetail } from "@/lib/api-types";
import { getCurrentUser, toPublicUser } from "@/lib/session";
import type { UserRow } from "@/db/schema";

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `cache` keeps this to one database round trip per request even though both
 * `generateMetadata` and the page itself need the document.
 *
 * A missing document and a document the viewer may not see are deliberately
 * indistinguishable: `loadDocumentForUser` throws in both cases and we answer 404.
 */
const loadDocument = cache(
  async (
    id: string,
  ): Promise<{ user: UserRow | null; detail: DocumentDetail | null }> => {
    const user = await getCurrentUser();
    if (!user) return { user: null, detail: null };
    try {
      const db = await getDb();
      const { detail } = await loadDocumentForUser(db, id, user);
      return { user, detail };
    } catch {
      return { user, detail: null };
    }
  },
);

export async function generateMetadata({ params }: DocumentPageProps): Promise<Metadata> {
  const { id } = await params;
  const { detail } = await loadDocument(id);
  return { title: detail ? `${detail.title} · Vellum` : "Document · Vellum" };
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const { user, detail } = await loadDocument(id);

  if (!user) redirect(`/login?next=/documents/${id}`);
  if (!detail) notFound();

  return <DocumentEditor document={detail} currentUser={toPublicUser(user)} />;
}
