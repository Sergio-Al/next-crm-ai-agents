import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { channels } from "@crm-agent/shared/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/channels — List enabled communication channel configs.
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.enabled, true));

  return NextResponse.json({ channels: rows });
}
