import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { enqueueEmbedding } from "@/lib/embedding-queue";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, id),
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ data: product });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.sku !== undefined) updates.sku = body.sku;
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) updates.category = body.category;
  if (body.price !== undefined) updates.price = body.price;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.stockQty !== undefined) updates.stockQty = body.stockQty;
  if (body.active !== undefined) updates.active = body.active;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [product] = await db
    .update(schema.products)
    .set(updates)
    .where(eq(schema.products.id, id))
    .returning();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Re-generate embedding if content fields changed
  if (body.name !== undefined || body.description !== undefined || body.category !== undefined || body.tags !== undefined) {
    const embeddingText = [product.name, product.description, product.category, ...(Array.isArray(product.tags) ? product.tags : [])].filter(Boolean).join(" ");
    enqueueEmbedding(product.id, embeddingText).catch(() => {});
  }

  return NextResponse.json({ data: product });
}
