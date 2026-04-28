import pg from "pg";

const { Client } = pg;

const databaseUrl =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  "postgresql://platform:platform@localhost:5432/platform";

async function ensureExtensions() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("[db:prepare] pgvector extension is ready");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    console.log("[db:prepare] pg_trgm extension is ready");
  } finally {
    await client.end();
  }
}

ensureExtensions().catch((error) => {
  console.error("[db:prepare] Failed to ensure pgvector extension:", error);
  process.exit(1);
});
