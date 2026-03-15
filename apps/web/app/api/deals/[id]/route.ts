import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.stageId) updates.stageId = body.stageId;
  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.value !== undefined) updates.value = body.value;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [deal] = await db
    .update(schema.deals)
    .set(updates)
    .where(eq(schema.deals.id, id))
    .returning();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({ data: deal });
}
