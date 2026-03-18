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

  const order = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      currency: schema.orders.currency,
      subtotal: schema.orders.subtotal,
      discountAmount: schema.orders.discountAmount,
      taxAmount: schema.orders.taxAmount,
      totalAmount: schema.orders.totalAmount,
      notes: schema.orders.notes,
      createdAt: schema.orders.createdAt,
      confirmedAt: schema.orders.confirmedAt,
      shippedAt: schema.orders.shippedAt,
      deliveredAt: schema.orders.deliveredAt,
      cancelledAt: schema.orders.cancelledAt,
      contactId: schema.contacts.id,
      contactFirstName: schema.contacts.firstName,
      contactLastName: schema.contacts.lastName,
      contactEmail: schema.contacts.email,
      dealId: schema.orders.dealId,
      accountId: schema.orders.accountId,
    })
    .from(schema.orders)
    .leftJoin(schema.contacts, eq(schema.orders.contactId, schema.contacts.id))
    .where(eq(schema.orders.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const items = await db
    .select({
      id: schema.orderItems.id,
      productId: schema.orderItems.productId,
      productName: schema.orderItems.productName,
      productSku: schema.orderItems.productSku,
      unitPrice: schema.orderItems.unitPrice,
      quantity: schema.orderItems.quantity,
      discountPct: schema.orderItems.discountPct,
      lineTotal: schema.orderItems.lineTotal,
      notes: schema.orderItems.notes,
    })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, id));

  return NextResponse.json({
    data: {
      ...order,
      contact: order.contactId
        ? {
            id: order.contactId,
            firstName: order.contactFirstName,
            lastName: order.contactLastName,
            email: order.contactEmail,
          }
        : null,
      items,
    },
  });
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const existing = await db.query.orders.findFirst({
    where: eq(schema.orders.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  // Status transition validation
  if (body.status && body.status !== existing.status) {
    const allowedTransitions = STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowedTransitions.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${existing.status}' to '${body.status}'` },
        { status: 400 },
      );
    }
    updates.status = body.status;

    // Set status transition timestamps
    const now = new Date();
    if (body.status === "confirmed") updates.confirmedAt = now;
    if (body.status === "shipped") updates.shippedAt = now;
    if (body.status === "delivered") updates.deliveredAt = now;
    if (body.status === "cancelled") updates.cancelledAt = now;
  }

  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.contactId !== undefined) updates.contactId = body.contactId;
  if (body.accountId !== undefined) updates.accountId = body.accountId;
  if (body.dealId !== undefined) updates.dealId = body.dealId;
  if (body.discountAmount !== undefined) {
    updates.discountAmount = body.discountAmount;
    // Recalculate total
    const subtotal = parseFloat(existing.subtotal ?? "0");
    const discount = parseFloat(body.discountAmount);
    const tax = parseFloat(existing.taxAmount ?? "0");
    updates.totalAmount = (subtotal - discount + tax).toFixed(2);
  }
  if (body.taxAmount !== undefined) {
    updates.taxAmount = body.taxAmount;
    const subtotal = parseFloat(existing.subtotal ?? "0");
    const discount = parseFloat(updates.discountAmount as string ?? existing.discountAmount ?? "0");
    const tax = parseFloat(body.taxAmount);
    updates.totalAmount = (subtotal - discount + tax).toFixed(2);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [order] = await db
    .update(schema.orders)
    .set(updates)
    .where(eq(schema.orders.id, id))
    .returning();

  return NextResponse.json({ data: order });
}
