import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const contact = await db.query.contacts.findFirst({
    where: eq(schema.contacts.id, id),
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const deals = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      currency: schema.deals.currency,
      status: schema.deals.status,
      expectedClose: schema.deals.expectedClose,
      stageName: schema.pipelineStages.name,
    })
    .from(schema.deals)
    .leftJoin(
      schema.pipelineStages,
      eq(schema.deals.stageId, schema.pipelineStages.id),
    )
    .where(eq(schema.deals.contactId, id));

  const orders = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      totalAmount: schema.orders.totalAmount,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
      itemCount: sql<number>`(select count(*) from ${schema.orderItems} where ${schema.orderItems.orderId} = ${schema.orders.id})`.as("itemCount"),
    })
    .from(schema.orders)
    .where(eq(schema.orders.contactId, id));

  return NextResponse.json({ data: { ...contact, deals, orders } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.firstName !== undefined) updates.firstName = body.firstName;
  if (body.lastName !== undefined) updates.lastName = body.lastName;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.companyName !== undefined) updates.companyName = body.companyName;
  if (body.source !== undefined) updates.source = body.source;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [contact] = await db
    .update(schema.contacts)
    .set(updates)
    .where(eq(schema.contacts.id, id))
    .returning();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ data: contact });
}
