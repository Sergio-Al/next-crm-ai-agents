import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { tools } from "@crm-agent/shared/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tools/[id] — Fetch a single tool by id.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = await db.query.tools.findFirst({ where: eq(tools.id, id) });
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}

/**
 * PATCH /api/tools/[id] — Update mutable fields. Only the fields present in the
 * body are updated; missing fields are left unchanged.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const db = getDb();
  const body = await req.json();

  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "name",
    "description",
    "systemPromptHint",
    "hitl",
    "enabled",
    "inputSchema",
    "config",
    "kind",
  ]) {
    if (k in body) update[k] = body[k];
  }

  const [row] = await db
    .update(tools)
    .set(update)
    .where(eq(tools.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}

/**
 * DELETE /api/tools/[id] — Soft-delete (sets deletedAt + disables).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const db = getDb();
  const [row] = await db
    .update(tools)
    .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(eq(tools.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}
