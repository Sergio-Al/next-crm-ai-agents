import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * PATCH /api/notifications/[id]/read — Mark a single notification as read.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }
  const member = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.workspaceId, workspace.id),
  });
  if (!member) {
    return NextResponse.json({ error: "No member found" }, { status: 403 });
  }

  const [updated] = await db
    .update(schema.notifications)
    .set({ read: true })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, member.userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ notification: updated });
}
