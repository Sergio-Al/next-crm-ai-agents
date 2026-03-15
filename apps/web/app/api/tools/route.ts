import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tools } from "@crm-agent/shared/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/tools — List all registered tools.
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(tools)
    .where(eq(tools.enabled, true));

  return NextResponse.json({ tools: rows });
}
