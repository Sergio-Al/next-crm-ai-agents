import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workspaces } from "@crm-agent/shared/db/schema";

/**
 * GET /api/workspace/list — List all workspaces.
 */
export async function GET() {
  const db = getDb();
  const rows = await db.select().from(workspaces);

  return NextResponse.json({ workspaces: rows });
}
