import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq, and, sql, desc } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
  }
  const db = getDb();

  const account = await db.query.crmAccounts.findFirst({
    where: eq(schema.crmAccounts.id, id),
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const contacts = await db
    .select({
      id: schema.contacts.id,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.accountId, id))
    .limit(50);

  const orders = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      totalAmount: schema.orders.totalAmount,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
      regionCode: schema.orders.regionCode,
      itemCount: sql<number>`(select count(*) from ${schema.orderItems} where ${schema.orderItems.orderId} = ${schema.orders.id})`.as(
        "itemCount",
      ),
    })
    .from(schema.orders)
    .where(eq(schema.orders.accountId, id))
    .orderBy(desc(schema.orders.createdAt))
    .limit(50);

  const stats = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      totalRevenue: sql<string>`coalesce(sum(${schema.orders.totalAmount}), 0)::text`,
      lastOrderAt: sql<string | null>`max(${schema.orders.createdAt})::text`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.accountId, id),
        eq(schema.orders.status, "confirmed"),
      ),
    )
    .then((r) => r[0]);

  // Weekly buckets over the last 60 days for sparkline visualizations.
  const trendRows = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('week', ${schema.orders.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${schema.orders.totalAmount}), 0)::text`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.accountId, id),
        eq(schema.orders.status, "confirmed"),
        sql`${schema.orders.createdAt} >= now() - interval '60 days'`,
      ),
    )
    .groupBy(sql`date_trunc('week', ${schema.orders.createdAt})`)
    .orderBy(sql`date_trunc('week', ${schema.orders.createdAt})`);

  const orderTrend = trendRows.map((r) => ({
    date: r.bucket,
    count: r.count,
    revenue: r.revenue,
  }));

  // Compute % delta vs first half of the window for trend badges.
  const half = Math.floor(orderTrend.length / 2);
  const firstHalf = orderTrend.slice(0, half).reduce((s, b) => s + b.count, 0);
  const secondHalf = orderTrend.slice(half).reduce((s, b) => s + b.count, 0);
  const orderDeltaPct =
    firstHalf > 0
      ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
      : secondHalf > 0
        ? 100
        : 0;
  const firstRevenue = orderTrend
    .slice(0, half)
    .reduce((s, b) => s + parseFloat(b.revenue || "0"), 0);
  const secondRevenue = orderTrend
    .slice(half)
    .reduce((s, b) => s + parseFloat(b.revenue || "0"), 0);
  const revenueDeltaPct =
    firstRevenue > 0
      ? Math.round(((secondRevenue - firstRevenue) / firstRevenue) * 100)
      : secondRevenue > 0
        ? 100
        : 0;

  return NextResponse.json({
    data: {
      ...account,
      contacts,
      orders,
      stats: {
        ...stats,
        orderTrend,
        orderDeltaPct,
        revenueDeltaPct,
      },
    },
  });
}
