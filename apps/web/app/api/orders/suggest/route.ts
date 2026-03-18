import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getDb } from "@/lib/db";
import { sql, eq, inArray } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/orders/suggest — AI product suggestions for a contact.
 *
 * Body: { contactId: string, limit?: number, locale?: string }
 *
 * Flow:
 * 1. Load contact's order history with items
 * 2. Build a purchase profile text
 * 3. Embed it via text-embedding-3-small
 * 4. pgvector cosine similarity search on products
 * 5. LLM reasons over candidates + history → ranked suggestions
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { contactId, limit: maxSuggestions = 5, locale } = body as {
    contactId?: string;
    limit?: number;
    locale?: string;
  };

  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const db = getDb();

  // 1. Load contact
  const contact = await db.query.contacts.findFirst({
    where: eq(schema.contacts.id, contactId),
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // 2. Load last 20 orders with items
  const orders = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      totalAmount: schema.orders.totalAmount,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .where(sql`${schema.orders.contactId} = ${contactId} and ${schema.orders.status} != 'cancelled'`)
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .limit(20);

  // Load items for these orders
  const orderIds = orders.map((o) => o.id);
  let orderItems: Array<{
    orderId: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }> = [];

  if (orderIds.length > 0) {
    orderItems = await db
      .select({
        orderId: schema.orderItems.orderId,
        productName: schema.orderItems.productName,
        productSku: schema.orderItems.productSku,
        quantity: schema.orderItems.quantity,
        unitPrice: schema.orderItems.unitPrice,
        lineTotal: schema.orderItems.lineTotal,
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, orderIds));
  }

  // 3. Build purchase profile text
  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const profileParts = [
    `Client: ${contactName}`,
    contact.companyName ? `Company: ${contact.companyName}` : null,
    contact.tags && contact.tags.length > 0 ? `Tags: ${contact.tags.join(", ")}` : null,
    `Orders: ${orders.length}`,
  ].filter(Boolean);

  if (orders.length > 0) {
    const itemsByOrder = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    for (const order of orders.slice(0, 10)) {
      const items = itemsByOrder.get(order.id) ?? [];
      const itemsStr = items.map((i) => `${i.productName} x${i.quantity}`).join(", ");
      profileParts.push(`Order ${order.number} (${order.status}, ${order.totalAmount} ${order.currency}): ${itemsStr}`);
    }
  }

  const profileText = profileParts.join("\n");

  // 4. Try vector similarity search if we have embeddings
  let candidateProducts: Array<{
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    category: string | null;
    price: string;
    currency: string | null;
    unit: string | null;
    tags: string[] | null;
    similarity?: number;
  }> = [];

  try {
    // Generate embedding for the profile
    const embeddingResponse = await openai.embedding("text-embedding-3-small");
    const { embeddings } = await embeddingResponse.doEmbed({ values: [profileText] });
    const profileEmbedding = embeddings[0];

    if (profileEmbedding) {
      // pgvector cosine similarity search
      const vectorStr = `[${profileEmbedding.join(",")}]`;
      candidateProducts = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          sku: schema.products.sku,
          description: schema.products.description,
          category: schema.products.category,
          price: schema.products.price,
          currency: schema.products.currency,
          unit: schema.products.unit,
          tags: schema.products.tags,
          similarity: sql<number>`1 - (${schema.products.embedding} <=> ${vectorStr}::vector)`,
        })
        .from(schema.products)
        .where(sql`${schema.products.active} = true and ${schema.products.embedding} is not null`)
        .orderBy(sql`${schema.products.embedding} <=> ${vectorStr}::vector`)
        .limit(15);
    }
  } catch {
    // Embedding not available — fall back to all active products
  }

  // Fallback: if no vector results, just get top products by popularity
  if (candidateProducts.length === 0) {
    candidateProducts = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        description: schema.products.description,
        category: schema.products.category,
        price: schema.products.price,
        currency: schema.products.currency,
        unit: schema.products.unit,
        tags: schema.products.tags,
      })
      .from(schema.products)
      .where(sql`${schema.products.active} = true`)
      .limit(15);
  }

  if (candidateProducts.length === 0) {
    return NextResponse.json({
      suggestions: [],
      reasoning: "No products available in the catalog.",
    });
  }

  // 5. LLM reasoning over candidates + history
  const candidateList = candidateProducts
    .map((p, i) => `${i + 1}. ${p.name} (${p.sku ?? "no SKU"}) — $${p.price} — ${p.category ?? "uncategorized"} — ${p.description ?? ""}`)
    .join("\n");

  const languageInstruction = locale && locale !== "en"
    ? `Respond in the language for locale "${locale}".`
    : "";

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are a sales intelligence AI. Given a client's purchase history and a list of candidate products, recommend the top ${maxSuggestions} products they should buy next. For each recommendation, explain WHY based on their history and profile. Be specific and actionable. Return valid JSON only. ${languageInstruction}`,
    prompt: `## Client Purchase Profile
${profileText}

## Candidate Products
${candidateList}

Return a JSON array of objects with: { "productId": "<id>", "productName": "<name>", "reason": "<specific reason>" }
Return at most ${maxSuggestions} products. Only return the JSON array, no other text.`,
  });

  // Parse LLM response
  let suggestions: Array<{ productId: string; productName: string; reason: string }> = [];
  try {
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    suggestions = JSON.parse(cleaned);
  } catch {
    suggestions = [];
  }

  // Enrich with product data
  const enriched = suggestions.map((s) => {
    const product = candidateProducts.find((p) => p.id === s.productId);
    return {
      ...s,
      price: product?.price ?? null,
      currency: product?.currency ?? null,
      category: product?.category ?? null,
      similarity: product && "similarity" in product ? product.similarity : null,
    };
  });

  return NextResponse.json({
    suggestions: enriched,
    profileSummary: profileText,
    orderCount: orders.length,
  });
}
