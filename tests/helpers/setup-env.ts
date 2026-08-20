/**
 * Each test file gets its own in-memory PGlite database (real Postgres, WASM build).
 * `getDb()` applies the migrations and the demo seed on first use, so the tests run
 * against the same schema and the same seeded workspace as local development.
 */
process.env.PGLITE_DATA_DIR = "memory://vellum-test";
process.env.AUTH_SECRET = "test-secret";
delete process.env.DATABASE_URL;
