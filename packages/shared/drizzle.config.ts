import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Use direct PG connection for migrations (not PgBouncer)
    url: process.env.POSTGRES_URL || "postgresql://platform:platform@localhost:5432/platform",
  },
  verbose: true,
  strict: true,
});
