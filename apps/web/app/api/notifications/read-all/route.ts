import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * PATCH /api/notifications/read-all — Mark all notifications for the
 * current user as read.
 */
export async function PATCH() {
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }
  const member = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.workspaceId, workspace.id),
  });
  if (!member) {
    return NextResponse.json({ updated: 0 });
  }

  const updated = await db
    .update(schema.notifications)
    .set({ read: true })
    .where(
      and(
        eq(schema.notifications.userId, member.userId),
        eq(schema.notifications.read, false),
      ),
    )
    .returning({ id: schema.notifications.id });

  return NextResponse.json({ updated: updated.length });
}
