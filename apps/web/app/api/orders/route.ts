import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const contactId = url.searchParams.get("contactId") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) {
    conditions.push(sql`${schema.orders.status} = ${status}`);
  }
  if (contactId) {
    conditions.push(sql`${schema.orders.contactId} = ${contactId}`);
  }
  if (search) {
    conditions.push(sql`(
      ${schema.orders.number} ilike ${"%" + search + "%"} or
      ${schema.contacts.firstName} ilike ${"%" + search + "%"} or
      ${schema.contacts.lastName} ilike ${"%" + search + "%"} or
      (${schema.contacts.firstName} || ' ' || ${schema.contacts.lastName}) ilike ${"%" + search + "%"}
    )`);
  }

  const where = conditions.length > 0
    ? sql.join(conditions, sql` and `)
    : sql`true`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.orders)
    .leftJoin(schema.contacts, sql`${schema.orders.contactId} = ${schema.contacts.id}`)
    .where(where);

  const rows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      currency: schema.orders.currency,
      totalAmount: schema.orders.totalAmount,
      notes: schema.orders.notes,
      contactId: schema.orders.contactId,
      contactFirstName: schema.contacts.firstName,
      contactLastName: schema.contacts.lastName,
      accountId: schema.orders.accountId,
      dealId: schema.orders.dealId,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .leftJoin(schema.contacts, sql`${schema.orders.contactId} = ${schema.contacts.id}`)
    .where(where)
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  // Get item counts for each order
  const orderIds = rows.map((r) => r.id);
  let itemCounts: Record<string, number> = {};
  if (orderIds.length > 0) {
    const counts = await db
      .select({
        orderId: schema.orderItems.orderId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.orderItems)
      .where(sql`${schema.orderItems.orderId} = any(${orderIds})`)
      .groupBy(schema.orderItems.orderId);
    itemCounts = Object.fromEntries(counts.map((c) => [c.orderId, c.count]));
  }

  const data = rows.map((r) => ({
    ...r,
    itemCount: itemCounts[r.id] ?? 0,
  }));

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const { contactId, accountId, dealId, currency, notes, items } = body as {
    contactId?: string;
    accountId?: string;
    dealId?: string;
    currency?: string;
    notes?: string;
    items?: Array<{
      productId: string;
      quantity?: number;
      discountPct?: number;
      notes?: string;
    }>;
  };

  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }

  // Generate order number: ORD-XXXX
  const [{ nextNum }] = await db.select({
    nextNum: sql<number>`coalesce(
      (select max(cast(substring(number from 5) as integer)) from orders where workspace_id = ${workspace.id}),
      0
    ) + 1`,
  }).from(sql`(select 1) as _dummy`);

  const orderNumber = `ORD-${String(nextNum).padStart(4, "0")}`;

  // Resolve products and calculate line totals
  let subtotal = 0;
  const resolvedItems: Array<{
    productId: string | null;
    productName: string;
    productSku: string | null;
    unitPrice: string;
    quantity: number;
    discountPct: string;
    lineTotal: string;
    notes: string | null;
  }> = [];

  if (items && items.length > 0) {
    for (const item of items) {
      const product = await db.query.products.findFirst({
        where: sql`${schema.products.id} = ${item.productId}`,
      });
      if (!product) continue;

      const qty = item.quantity ?? 1;
      const discPct = item.discountPct ?? 0;
      const unitPrice = parseFloat(product.price);
      const lineTotal = unitPrice * qty * (1 - discPct / 100);

      subtotal += lineTotal;

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        unitPrice: product.price,
        quantity: qty,
        discountPct: discPct.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        notes: item.notes ?? null,
      });
    }
  }

  const totalAmount = subtotal;

  const [order] = await db
    .insert(schema.orders)
    .values({
      workspaceId: workspace.id,
      number: orderNumber,
      contactId: contactId || null,
      accountId: accountId || null,
      dealId: dealId || null,
      status: "draft",
      currency: currency || "USD",
      subtotal: subtotal.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      notes: notes || null,
    })
    .returning();

  // Insert order items
  if (resolvedItems.length > 0) {
    await db.insert(schema.orderItems).values(
      resolvedItems.map((item) => ({
        ...item,
        orderId: order.id,
      })),
    );
  }

  return NextResponse.json({ data: order }, { status: 201 });
}
