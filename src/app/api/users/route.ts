import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { listUsers } from "@/db/queries";
import { withErrorHandling } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Directory of seeded accounts, used by the share dialog's quick-pick. */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const db = await getDb();
  return NextResponse.json({ users: await listUsers(db, user.id) });
});
