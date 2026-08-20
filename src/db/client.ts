import "server-only";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Two drivers, one dialect (Postgres):
 *
 *  - `DATABASE_URL` set   -> node-postgres against a real Postgres (Neon on Vercel).
 *  - `DATABASE_URL` unset -> PGlite, Postgres compiled to WASM, stored in `.data/`.
 *
 * The fallback is what makes `npm install && npm run dev` work with zero setup for
 * a reviewer: same SQL, same migrations, no Docker, no cloud account. Tests use the
 * in-memory variant of the same driver (see tests/helpers/test-db.ts).
 */
declare global {
  // eslint-disable-next-line no-var
  var __vellumDb: Promise<Db> | undefined;
}

async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? ".data/pglite";
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;

  // Zero-setup path: bring the schema (and demo data) up on first boot.
  const { applyMigrations } = await import("./migrate");
  const { seedDatabase } = await import("./seed");
  await applyMigrations(async (sql) => {
    await client.exec(sql);
  });
  await seedDatabase(db);
  return db;
}

async function createNodePostgresDb(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString,
    // Managed Postgres (Neon/Supabase) terminates TLS at the pooler.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false },
    max: 3,
  });
  return drizzle(pool, { schema });
}

export function getDb(): Promise<Db> {
  if (!globalThis.__vellumDb) {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.NODE_ENV === "production") {
      // Fail loudly: the WASM fallback keeps data in the serverless container's
      // filesystem, which is per-instance and thrown away. Never in production.
      throw new Error(
        "DATABASE_URL is required in production. Set it to a Postgres connection string.",
      );
    }
    globalThis.__vellumDb = url ? createNodePostgresDb(url) : createPgliteDb();
  }
  return globalThis.__vellumDb;
}

export { schema };
