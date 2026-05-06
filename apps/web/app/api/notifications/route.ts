import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";

/**
 * GET /api/notifications
 *
 * Query params:
 *   - unreadOnly?: "true" | "false"     (default false)
 *   - limit?:     number 1..100         (default 20)
 *   - cursor?:    ISO timestamp         (paginates by createdAt < cursor)
 *
 * Returns: { notifications, unreadCount, nextCursor }
 *
 * Auth: follows existing dev convention — picks first workspace + first member.
 * Replace with real session helper when auth lands.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    100,
  );
  const cursor = url.searchParams.get("cursor");

  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }
  const member = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.workspaceId, workspace.id),
  });
  if (!member) {
    return NextResponse.json(
      { notifications: [], unreadCount: 0, nextCursor: null },
      { status: 200 },
    );
  }

  const conditions = [eq(schema.notifications.userId, member.userId)];
  if (unreadOnly) conditions.push(eq(schema.notifications.read, false));
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(schema.notifications.createdAt, cursorDate));
    }
  }

  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? items[items.length - 1]?.createdAt?.toISOString() ?? null
      : null;

  // Unread count (always returned, regardless of filter)
  const unreadRows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, member.userId),
        eq(schema.notifications.read, false),
      ),
    );

  return NextResponse.json({
    notifications: items,
    unreadCount: unreadRows.length,
    nextCursor,
  });
}
