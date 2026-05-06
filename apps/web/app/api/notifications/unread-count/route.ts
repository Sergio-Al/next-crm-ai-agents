import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * GET /api/notifications/unread-count — Fast count of unread notifications.
 *
 * Uses the (userId, read, createdAt) index for sub-millisecond reads.
 */
export async function GET() {
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ count: 0 });
  }
  const member = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.workspaceId, workspace.id),
  });
  if (!member) {
    return NextResponse.json({ count: 0 });
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, member.userId),
        eq(schema.notifications.read, false),
      ),
    );

  return NextResponse.json({ count: row?.count ?? 0 });
}
