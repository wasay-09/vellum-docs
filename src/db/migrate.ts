import { promises as fs } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * Deliberately tiny migration runner: read the generated `.sql` files in order and
 * hand each statement to the caller's executor. Keeping this driver-agnostic is what
 * lets the same migrations run on Neon, local Postgres and PGlite.
 */
export async function applyMigrations(
  exec: (sql: string) => Promise<void>,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const raw = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of raw.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) await exec(sql);
    }
  }
  return files;
}
