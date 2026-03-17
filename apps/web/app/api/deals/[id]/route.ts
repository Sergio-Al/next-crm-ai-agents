import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const rows = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      currency: schema.deals.currency,
      status: schema.deals.status,
      stageId: schema.deals.stageId,
      expectedClose: schema.deals.expectedClose,
      createdAt: schema.deals.createdAt,
      stageName: schema.pipelineStages.name,
      contactId: schema.contacts.id,
      contactFirstName: schema.contacts.firstName,
      contactLastName: schema.contacts.lastName,
      contactEmail: schema.contacts.email,
    })
    .from(schema.deals)
    .leftJoin(
      schema.pipelineStages,
      eq(schema.deals.stageId, schema.pipelineStages.id),
    )
    .leftJoin(
      schema.contacts,
      eq(schema.deals.contactId, schema.contacts.id),
    )
    .where(eq(schema.deals.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: row.id,
      title: row.title,
      value: row.value,
      currency: row.currency,
      status: row.status,
      stageId: row.stageId,
      stageName: row.stageName,
      expectedClose: row.expectedClose,
      createdAt: row.createdAt,
      contact: row.contactId
        ? {
            id: row.contactId,
            firstName: row.contactFirstName,
            lastName: row.contactLastName,
            email: row.contactEmail,
          }
        : null,
    },
  });
}

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
