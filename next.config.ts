import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres and mammoth reads zip archives from disk:
  // both must stay outside the bundler and run as plain Node modules on the server.
  serverExternalPackages: ["@electric-sql/pglite", "mammoth"],
};

export default nextConfig;
