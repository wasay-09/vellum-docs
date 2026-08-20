import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors";
import { getCurrentUser, toPublicUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
});
