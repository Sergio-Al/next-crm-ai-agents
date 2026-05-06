import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { tools } from "@crm-agent/shared/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * GET /api/tools — List registry tools (excludes soft-deleted).
 *
 * Query params:
 *   - enabledOnly=1 — return only enabled rows
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const enabledOnly = req.nextUrl.searchParams.get("enabledOnly") === "1";

  const where = enabledOnly
    ? and(eq(tools.enabled, true), isNull(tools.deletedAt))
    : isNull(tools.deletedAt);

  const rows = await db
    .select()
    .from(tools)
    .where(where)
    .orderBy(desc(tools.createdAt));

  return NextResponse.json({ data: rows });
}

/**
 * POST /api/tools — Create a new registry tool (HTTP kind via admin UI).
 *
 * Body: { name, description?, kind?, systemPromptHint?, hitl?, inputSchema?, config, enabled?, workspaceId? }
 */
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const kind = body.kind ?? "http";
  if (kind !== "http" && kind !== "static") {
    return NextResponse.json(
      { error: "kind must be 'http' or 'static' (query is reserved)" },
      { status: 400 },
    );
  }
  if (kind === "http") {
    const cfg = body.config;
    if (!cfg?.url || !cfg.method) {
      return NextResponse.json(
        { error: "http tools require config.url and config.method" },
        { status: 400 },
      );
    }
  }

  try {
    const [row] = await db
      .insert(tools)
      .values({
        name: body.name,
        description: body.description ?? null,
        kind,
        systemPromptHint: body.systemPromptHint ?? null,
        hitl: body.hitl === true,
        inputSchema: body.inputSchema ?? [],
        config: body.config ?? {},
        enabled: body.enabled !== false,
        workspaceId: body.workspaceId ?? null,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "insert failed" },
      { status: 500 },
    );
  }
}
