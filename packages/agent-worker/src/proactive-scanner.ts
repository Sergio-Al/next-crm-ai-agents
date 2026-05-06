import { Worker, Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";
import { createDb } from "@crm-agent/shared/db";
import * as schema from "@crm-agent/shared/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { publishEvent } from "./stream-emitter.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

let _db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!_db) _db = createDb(DATABASE_URL);
  return _db;
}

const QUEUE_NAME = "proactive-scan";
const SCHEDULER_KEY = "proactive-scan-hourly";
const DEFAULT_PATTERN = process.env.PROACTIVE_SCAN_CRON ?? "0 * * * *"; // hourly
const DEDUPE_WINDOW_HOURS = 24;

type ScanFinding = {
  type: string;
  entityId: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Each scanner returns findings for one workspace. Findings are then
 * deduped against recent notifications of the same (type, entityId)
 * before being inserted + published.
 */
type Scanner = (
  db: ReturnType<typeof createDb>,
  workspaceId: string,
) => Promise<ScanFinding[]>;

// ─────────────────────────────────────────────────────────────────────
// Scanners
// ─────────────────────────────────────────────────────────────────────

const scanStuckConfirmed: Scanner = async (db, workspaceId) => {
  const rows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      confirmedAt: schema.orders.confirmedAt,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.workspaceId, workspaceId),
        eq(schema.orders.status, "confirmed"),
        sql`${schema.orders.shippedAt} IS NULL`,
        sql`${schema.orders.confirmedAt} < now() - interval '7 days'`,
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    type: "order_stuck",
    entityId: r.id,
    title: `Order ${r.number} stuck — confirmed but not shipped`,
    body: `Confirmed on ${r.confirmedAt?.toISOString().slice(0, 10) ?? "?"}, no ship date set.`,
    link: `/orders/${r.id}`,
    metadata: { entityId: r.id, condition: "stuck_confirmed_7d" },
  }));
};

const scanOverdueDelivery: Scanner = async (db, workspaceId) => {
  const rows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      promisedDate: sql<string>`${schema.orders.customFields}->>'_fecha_entrega'`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.workspaceId, workspaceId),
        eq(schema.orders.status, "confirmed"),
        sql`${schema.orders.shippedAt} IS NULL`,
        sql`(${schema.orders.customFields}->>'_fecha_entrega')::timestamptz < now()`,
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    type: "order_overdue_delivery",
    entityId: r.id,
    title: `Order ${r.number} past promised delivery`,
    body: r.promisedDate
      ? `Promised delivery: ${r.promisedDate.slice(0, 10)}.`
      : undefined,
    link: `/orders/${r.id}`,
    metadata: { entityId: r.id, condition: "overdue_delivery" },
  }));
};

const SAP_ERROR_STATES = ["ERROR", "FALLO", "REJECTED", "FAILED"];

const scanSapSyncFailures: Scanner = async (db, workspaceId) => {
  const rows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      syncState: sql<string>`${schema.orders.customFields}->>'_estado_sync'`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.workspaceId, workspaceId),
        inArray(sql<string>`${schema.orders.customFields}->>'_estado_sync'`, SAP_ERROR_STATES),
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    type: "order_sap_sync_error",
    entityId: r.id,
    title: `Order ${r.number} — SAP sync error (${r.syncState})`,
    body: `Order is in error state and likely needs manual review.`,
    link: `/orders/${r.id}`,
    metadata: { entityId: r.id, condition: "sap_sync_error", syncState: r.syncState },
  }));
};

const scanDormantAccounts: Scanner = async (db, workspaceId) => {
  // Accounts that had at least one confirmed order, where the most recent
  // order was created more than 60 days ago. Hits the reorder window.
  const rows = await db.execute(sql<{
    account_id: string;
    account_name: string;
    last_order_at: string;
  }>`
    SELECT
      a.id   AS account_id,
      a.name AS account_name,
      MAX(o.created_at) AS last_order_at
    FROM ${schema.crmAccounts} a
    JOIN ${schema.orders} o ON o.account_id = a.id
    WHERE a.workspace_id = ${workspaceId}
      AND o.status = 'confirmed'
    GROUP BY a.id, a.name
    HAVING MAX(o.created_at) < now() - interval '60 days'
    LIMIT 50
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    type: "account_dormant",
    entityId: String(r.account_id),
    title: `${r.account_name} — no orders in 60+ days`,
    body: `Last order ${String(r.last_order_at).slice(0, 10)}. Reorder outreach recommended.`,
    link: `/accounts/${String(r.account_id)}`,
    metadata: { entityId: String(r.account_id), condition: "dormant_60d" },
  }));
};

const scanStaleDeals: Scanner = async (db, workspaceId) => {
  const rows = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      updatedAt: schema.deals.updatedAt,
    })
    .from(schema.deals)
    .where(
      and(
        eq(schema.deals.workspaceId, workspaceId),
        eq(schema.deals.status, "open"),
        sql`${schema.deals.updatedAt} < now() - interval '14 days'`,
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    type: "deal_stale",
    entityId: r.id,
    title: `Deal "${r.title}" hasn't moved in 14+ days`,
    body: `Last update ${r.updatedAt?.toISOString().slice(0, 10) ?? "?"}.`,
    link: `/deals/${r.id}`,
    metadata: { entityId: r.id, condition: "stale_14d" },
  }));
};

const SCANNERS: Scanner[] = [
  scanStuckConfirmed,
  scanOverdueDelivery,
  scanSapSyncFailures,
  scanDormantAccounts,
  scanStaleDeals,
];

// ─────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────

async function isDuplicate(
  db: ReturnType<typeof createDb>,
  userId: string,
  type: string,
  entityId: string,
): Promise<boolean> {
  const [hit] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.type, type),
        sql`${schema.notifications.metadata}->>'entityId' = ${entityId}`,
        sql`${schema.notifications.createdAt} > now() - interval '${sql.raw(String(DEDUPE_WINDOW_HOURS))} hours'`,
      ),
    )
    .limit(1);
  return Boolean(hit);
}

async function emitFinding(
  db: ReturnType<typeof createDb>,
  workspaceId: string,
  userId: string,
  finding: ScanFinding,
): Promise<boolean> {
  if (await isDuplicate(db, userId, finding.type, finding.entityId)) {
    return false;
  }
  const [inserted] = await db
    .insert(schema.notifications)
    .values({
      workspaceId,
      userId,
      type: finding.type,
      title: finding.title,
      body: finding.body ?? null,
      link: finding.link ?? null,
      metadata: finding.metadata ?? {},
    })
    .returning();
  if (!inserted) return false;
  try {
    await publishEvent(`user:${userId}`, {
      type: "notification",
      id: inserted.id,
      notificationType: inserted.type,
      title: inserted.title,
      body: inserted.body ?? null,
      link: inserted.link ?? null,
      createdAt: (inserted.createdAt ?? new Date()).toISOString(),
      metadata: (inserted.metadata as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    console.error("[ProactiveScanner] publishEvent failed:", err);
  }
  return true;
}

async function runScan(): Promise<{ workspaces: number; created: number }> {
  const db = getDb();
  const workspaces = await db.select({ id: schema.workspaces.id }).from(schema.workspaces);
  let created = 0;

  for (const ws of workspaces) {
    const member = await db.query.workspaceMembers.findFirst({
      where: eq(schema.workspaceMembers.workspaceId, ws.id),
    });
    if (!member) continue;

    for (const scanner of SCANNERS) {
      try {
        const findings = await scanner(db, ws.id);
        for (const f of findings) {
          if (await emitFinding(db, ws.id, member.userId, f)) created++;
        }
      } catch (err) {
        console.error(`[ProactiveScanner] scanner ${scanner.name} failed:`, err);
      }
    }
  }

  return { workspaces: workspaces.length, created };
}

// ─────────────────────────────────────────────────────────────────────
// Worker bootstrap
// ─────────────────────────────────────────────────────────────────────

export async function startProactiveScannerWorker() {
  const connection = createRedisConnection();
  const queue = new Queue(QUEUE_NAME, {
    connection: createRedisConnection() as never,
  });

  // Register the recurring schedule (idempotent — upsert)
  try {
    await queue.upsertJobScheduler(
      SCHEDULER_KEY,
      { pattern: DEFAULT_PATTERN },
      { name: "scan-all-workspaces", data: {} },
    );
    console.log(
      `[ProactiveScanner] cron registered (${SCHEDULER_KEY} → ${DEFAULT_PATTERN})`,
    );
  } catch (err) {
    console.error("[ProactiveScanner] failed to register scheduler:", err);
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      console.log(`[ProactiveScanner] starting scan (job ${job.id})`);
      const result = await runScan();
      console.log(
        `[ProactiveScanner] done — workspaces=${result.workspaces}, created=${result.created}`,
      );
      return result;
    },
    { connection: connection as never, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[ProactiveScanner] job ${job?.id} failed:`, err);
  });

  console.log("[ProactiveScanner] worker started");
  return worker;
}

// Allow manual trigger from a CLI/REPL for testing
export { runScan };
