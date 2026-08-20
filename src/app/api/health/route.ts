import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documents, users } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Deployment smoke test: proves the app can reach its database. */
export const GET = async () => {
  try {
    const db = await getDb();
    const [{ count: userCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const [{ count: documentCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents);
    return NextResponse.json({
      status: "ok",
      driver: process.env.DATABASE_URL ? "postgres" : "pglite",
      users: userCount,
      documents: documentCount,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
};
