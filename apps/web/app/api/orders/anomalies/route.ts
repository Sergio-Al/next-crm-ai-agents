import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql, eq, and, isNull, isNotNull, lt, lte } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

const SAP_ERROR_STATES = new Set([
  "Error",
  "ERROR",
  "error",
  "Failed",
  "FAILED",
  "Rechazado",
  "Fallido",
  "Pendiente Error",
]);

const STUCK_THRESHOLD_DAYS = 7;
const OVERDUE_CRITICAL_DAYS = 14;

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") ?? "";
  const contactId = url.searchParams.get("contactId") ?? "";
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));

  type Anomaly = {
    orderId: string;
    orderNumber: string;
    accountName: string | null;
    type: "overdue_delivery" | "stuck_confirmed" | "sap_error";
    severity: "warning" | "critical";
    detail: string;
    daysSince: number;
  };

  const anomalies: Anomaly[] = [];

  // Base filter conditions for the orders table
  const baseConditions: ReturnType<typeof sql>[] = [
    sql`${schema.orders.status} = 'confirmed'`,
    isNull(schema.orders.shippedAt),
  ];
  if (accountId) {
    baseConditions.push(eq(schema.orders.accountId, accountId));
  }
  if (contactId) {
    baseConditions.push(eq(schema.orders.contactId, contactId));
  }
  const baseWhere = sql.join(baseConditions, sql` AND `);

  // 1 ── Overdue delivery: has fecha_entrega in the past
  const overdueRows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      accountName: schema.crmAccounts.name,
      fechaEntrega: schema.suiteRecoPedidos.fechaEntrega,
    })
    .from(schema.orders)
    .innerJoin(
      schema.suiteRecoPedidos,
      eq(schema.suiteRecoPedidos.orderId, schema.orders.id),
    )
    .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
    .where(
      sql`${baseWhere}
        AND ${schema.suiteRecoPedidos.fechaEntrega} IS NOT NULL
        AND ${schema.suiteRecoPedidos.fechaEntrega} < NOW()`,
    )
    .limit(limit);

  for (const row of overdueRows) {
    const daysSince = row.fechaEntrega
      ? Math.floor((Date.now() - new Date(row.fechaEntrega).getTime()) / 86_400_000)
      : 0;
    anomalies.push({
      orderId: row.id,
      orderNumber: row.number,
      accountName: row.accountName ?? null,
      type: "overdue_delivery",
      severity: daysSince >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning",
      detail: `Delivery date was ${new Date(row.fechaEntrega!).toLocaleDateString()} — ${daysSince}d overdue`,
      daysSince,
    });
  }

  // 2 ── Stuck confirmed: no fecha_entrega, confirmed > STUCK_THRESHOLD_DAYS ago
  const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_DAYS * 86_400_000);
  const stuckRows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      accountName: schema.crmAccounts.name,
      confirmedAt: schema.orders.confirmedAt,
    })
    .from(schema.orders)
    .leftJoin(
      schema.suiteRecoPedidos,
      eq(schema.suiteRecoPedidos.orderId, schema.orders.id),
    )
    .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
    .where(
      sql`${baseWhere}
        AND ${schema.orders.confirmedAt} IS NOT NULL
        AND ${schema.orders.confirmedAt} < ${stuckThreshold.toISOString()}
        AND (${schema.suiteRecoPedidos.fechaEntrega} IS NULL
             OR ${schema.suiteRecoPedidos.fechaEntrega} >= NOW())`,
    )
    .limit(limit);

  for (const row of stuckRows) {
    const daysSince = row.confirmedAt
      ? Math.floor((Date.now() - new Date(row.confirmedAt).getTime()) / 86_400_000)
      : 0;
    anomalies.push({
      orderId: row.id,
      orderNumber: row.number,
      accountName: row.accountName ?? null,
      type: "stuck_confirmed",
      severity: daysSince >= 30 ? "critical" : "warning",
      detail: `Confirmed ${daysSince}d ago, not yet shipped`,
      daysSince,
    });
  }

  // 3 ── SAP sync failure: estadoSync contains a known error value
  const syncErrorRows = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      accountName: schema.crmAccounts.name,
      estadoSync: schema.suiteRecoPedidos.estadoSync,
      updatedAt: schema.suiteRecoPedidos.updatedAt,
    })
    .from(schema.orders)
    .innerJoin(
      schema.suiteRecoPedidos,
      eq(schema.suiteRecoPedidos.orderId, schema.orders.id),
    )
    .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
    .where(
      sql`${schema.suiteRecoPedidos.estadoSync} IS NOT NULL
        ${accountId ? sql`AND ${schema.orders.accountId} = ${accountId}` : sql``}
        ${contactId ? sql`AND ${schema.orders.contactId} = ${contactId}` : sql``}`,
    )
    .limit(limit);

  for (const row of syncErrorRows) {
    if (!row.estadoSync || !SAP_ERROR_STATES.has(row.estadoSync)) continue;
    const daysSince = row.updatedAt
      ? Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / 86_400_000)
      : 0;
    anomalies.push({
      orderId: row.id,
      orderNumber: row.number,
      accountName: row.accountName ?? null,
      type: "sap_error",
      severity: "warning",
      detail: `SAP sync state: ${row.estadoSync}`,
      daysSince,
    });
  }

  return NextResponse.json({ anomalies });
}
