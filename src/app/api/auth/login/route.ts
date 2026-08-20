import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { findUserByEmail } from "@/db/queries";
import { badRequest, unauthorized, withErrorHandling } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { startSession, toPublicUser } from "@/lib/session";

const bodySchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export const POST = withErrorHandling(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest("Enter an email and password.", parsed.error.flatten());
  }

  const db = await getDb();
  const user = await findUserByEmail(db, parsed.data.email);
  // Same message either way: never reveal which accounts exist.
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) {
    throw unauthorized("That email and password don't match a demo account.");
  }

  await startSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
});
