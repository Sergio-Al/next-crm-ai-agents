import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { enqueueEmbedding } from "@/lib/embedding-queue";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const activeOnly = url.searchParams.get("active") !== "false";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (activeOnly) {
    conditions.push(sql`${schema.products.active} = true`);
  }
  if (search) {
    conditions.push(sql`(
      ${schema.products.name} ilike ${"%" + search + "%"} or
      ${schema.products.sku} ilike ${"%" + search + "%"} or
      ${schema.products.description} ilike ${"%" + search + "%"}
    )`);
  }
  if (category) {
    conditions.push(sql`${schema.products.category} = ${category}`);
  }

  const where = conditions.length > 0
    ? sql.join(conditions, sql` and `)
    : sql`true`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(where);

  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      description: schema.products.description,
      category: schema.products.category,
      price: schema.products.price,
      currency: schema.products.currency,
      unit: schema.products.unit,
      stockQty: schema.products.stockQty,
      active: schema.products.active,
      tags: schema.products.tags,
      createdAt: schema.products.createdAt,
    })
    .from(schema.products)
    .where(where)
    .orderBy(sql`${schema.products.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const { name, sku, description, category, price, currency, unit, stockQty, tags } = body as {
    name?: string;
    sku?: string;
    description?: string;
    category?: string;
    price?: string;
    currency?: string;
    unit?: string;
    stockQty?: number;
    tags?: string[];
  };

  if (!name || !price) {
    return NextResponse.json(
      { error: "name and price are required" },
      { status: 400 },
    );
  }

  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }

  const [product] = await db
    .insert(schema.products)
    .values({
      workspaceId: workspace.id,
      name,
      sku: sku || null,
      description: description || null,
      category: category || null,
      price,
      currency: currency || "USD",
      unit: unit || "piece",
      stockQty: stockQty ?? null,
      tags: tags ?? [],
    })
    .returning();

  // Enqueue embedding generation in background
  const embeddingText = [name, description, category, ...(tags ?? [])].filter(Boolean).join(" ");
  enqueueEmbedding(product.id, embeddingText).catch(() => {});

  return NextResponse.json({ data: product }, { status: 201 });
}
