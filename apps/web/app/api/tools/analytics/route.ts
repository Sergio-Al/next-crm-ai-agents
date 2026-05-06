import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { toolCalls } from "@crm-agent/shared/db/schema";
import { gte, sql } from "drizzle-orm";

/**
 * GET /api/tools/analytics — Aggregate tool_calls metrics for the last N days.
 *
 * Query params:
 *   - days=7  (default 7, max 90)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysParam = parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Math.min(Math.max(daysParam || 7, 1), 90);

  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Pull aggregate stats per tool. p95 via percentile_cont.
  const rows = await db
    .select({
      toolName: toolCalls.toolName,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${toolCalls.status} = 'error')::int`,
      p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${toolCalls.durationMs}), 0)::int`,
    })
    .from(toolCalls)
    .where(gte(toolCalls.createdAt, since))
    .groupBy(toolCalls.toolName);

  rows.sort((a, b) => b.calls - a.calls);

  return NextResponse.json({ data: rows, days });
}
