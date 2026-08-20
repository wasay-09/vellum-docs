import type { Config } from "drizzle-kit";

// Used only for authoring new migrations (`npm run db:generate`). Runtime schema
// creation goes through the driver-agnostic runner in src/db/migrate.ts.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/vellum",
  },
} satisfies Config;
