import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { listDocumentsForUser } from "@/db/queries";
import { getCurrentUser, toPublicUser } from "@/lib/session";
import { AppHeader } from "@/components/shell/AppHeader";
import { DocumentDashboard } from "@/components/documents/DocumentDashboard";

export const metadata: Metadata = {
  title: "Documents — Vellum",
};

/**
 * The list is fetched on the server for the first paint, then handed to the client
 * dashboard as `initialData` — so there is no loading flash and no waterfall.
 */
export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const data = await listDocumentsForUser(db, user.id);
  const currentUser = toPublicUser(user);

  return (
    <>
      <AppHeader user={currentUser} />
      <DocumentDashboard initialData={data} currentUser={currentUser} />
    </>
  );
}
