import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subagentRuns } from "@crm-agent/shared/db/schema";

/**
 * GET /api/chat/subagents?parentSessionKey=... — List child agents for a session.
 */
export async function GET(req: NextRequest) {
  const parentSessionKey = req.nextUrl.searchParams.get("parentSessionKey");

  if (!parentSessionKey) {
    return NextResponse.json(
      { error: "parentSessionKey query parameter required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(subagentRuns)
    .where(eq(subagentRuns.parentSessionKey, parentSessionKey));

  return NextResponse.json({ subagents: rows });
}
