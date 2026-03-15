import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { workspaces } from "@crm-agent/shared/db/schema";

/**
 * POST /api/workspace/init — Initialize a new workspace.
 */
export async function POST(req: NextRequest) {
  const { name, slug, ownerId } = (await req.json()) as {
    name?: string;
    slug?: string;
    ownerId?: string;
  };

  if (!name || !slug || !ownerId) {
    return NextResponse.json(
      { error: "name, slug, and ownerId are required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [row] = await db
    .insert(workspaces)
    .values({ name, slug, ownerId })
    .returning();

  return NextResponse.json({ workspace: row }, { status: 201 });
}
