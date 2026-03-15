import { createDb } from "@crm-agent/shared/db";

const POSTGRES_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!_db) {
    _db = createDb(POSTGRES_URL);
  }
  return _db;
}
