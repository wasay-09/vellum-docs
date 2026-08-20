import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

/**
 * The root is a pure router: signed-in reviewers land on their documents, everyone
 * else lands on the login screen. Doing this on the server means no client-side
 * redirect flash.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/documents" : "/login");
}
