import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const where = search
    ? sql`(
        ${schema.crmAccounts.name} ilike ${"%" + search + "%"} or
        ${schema.crmAccounts.industry} ilike ${"%" + search + "%"} or
        ${schema.crmAccounts.sapAccountId} ilike ${"%" + search + "%"} or
        ${schema.crmAccounts.website} ilike ${"%" + search + "%"}
      )`
    : sql`true`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.crmAccounts)
    .where(where);

  const rows = await db
    .select({
      id: schema.crmAccounts.id,
      name: schema.crmAccounts.name,
      industry: schema.crmAccounts.industry,
      website: schema.crmAccounts.website,
      sapAccountId: schema.crmAccounts.sapAccountId,
      tags: schema.crmAccounts.tags,
      createdAt: schema.crmAccounts.createdAt,
    })
    .from(schema.crmAccounts)
    .where(where)
    .orderBy(sql`${schema.crmAccounts.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  });
}
