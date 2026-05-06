import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _queue: Queue | null = null;
function getQueue() {
  if (!_queue) {
    const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    _queue = new Queue("order-ops", { connection });
  }
  return _queue;
}

/**
 * POST /api/orders/bulk-reschedule
 *
 * Body: { fromDate: string (ISO), toDate: string (ISO), reason?: string }
 *
 * 1. Looks up all orders whose suite_reco.pedidos.fecha_entrega falls within
 *    the fromDate calendar day.
 * 2. Enqueues a BullMQ job on the "order-ops" queue.
 * 3. Returns { jobId, count, orderIds } immediately (async execution).
 */
export async function POST(req: NextRequest) {
  let body: { fromDate?: string; toDate?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fromDate, toDate, reason } = body ?? {};
  if (!fromDate || !toDate) {
    return NextResponse.json(
      { error: "fromDate and toDate are required (ISO 8601)" },
      { status: 400 },
    );
  }

  // Parse and build the day window for fromDate
  let dayStart: Date;
  let dayEnd: Date;
  try {
    dayStart = new Date(fromDate);
    dayStart.setHours(0, 0, 0, 0);
    dayEnd = new Date(fromDate);
    dayEnd.setHours(23, 59, 59, 999);
  } catch {
    return NextResponse.json({ error: "Invalid fromDate format" }, { status: 400 });
  }

  let newDate: Date;
  try {
    newDate = new Date(toDate);
    if (isNaN(newDate.getTime())) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid toDate format" }, { status: 400 });
  }

  const db = getDb();

  // Find all pedidos with fecha_entrega in the fromDate window
  const pedidos = await db.execute(sql`
    SELECT p.id AS pedido_id, p.order_id, p.fecha_entrega, a.name AS account_name, o.number AS order_number
    FROM suite_reco.pedidos p
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN crm_accounts a ON a.id = p.account_id
    WHERE p.fecha_entrega >= ${dayStart.toISOString()}::timestamptz
      AND p.fecha_entrega <= ${dayEnd.toISOString()}::timestamptz
      AND p.order_id IS NOT NULL
  `);

  if (pedidos.rows.length === 0) {
    return NextResponse.json({ jobId: null, count: 0, orderIds: [], message: "No deliveries found for that date" });
  }

  const orderIds = (pedidos.rows as { order_id: string }[]).map((r) => r.order_id).filter(Boolean);

  // Enqueue BullMQ job
  const queue = getQueue();
  const job = await queue.add(
    "reschedule-deliveries",
    {
      orderIds,
      newDate: newDate.toISOString(),
      reason: reason ?? null,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  );

  return NextResponse.json({
    jobId: job.id,
    count: orderIds.length,
    orderIds,
    newDate: newDate.toISOString(),
    preview: pedidos.rows,
  });
}
