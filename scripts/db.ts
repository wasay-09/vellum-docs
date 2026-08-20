/**
 * Database CLI for the hosted Postgres path (Neon on Vercel, or any DATABASE_URL).
 *
 *   npm run db:migrate   apply drizzle/*.sql
 *   npm run db:seed      insert the demo accounts + starter documents (idempotent)
 *   npm run db:setup     both, in order
 *
 * The zero-setup local path (PGlite) does this automatically on first boot, so this
 * script exists for deployments.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { applyMigrations } from "../src/db/migrate";
import { seedDatabase } from "../src/db/seed";

async function main() {
  const command = process.argv[2] ?? "setup";
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Local development does not need it (PGlite is used);\n" +
        "set it to a Postgres connection string to migrate/seed a deployed database.",
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema });

  if (command === "migrate" || command === "setup") {
    const files = await applyMigrations(async (sql) => {
      await pool.query(sql);
    });
    console.log(`migrated: ${files.join(", ") || "nothing to do"}`);
  }

  if (command === "seed" || command === "setup") {
    const { created } = await seedDatabase(db);
    console.log(created ? "seeded demo workspace" : "seed skipped (users already exist)");
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
