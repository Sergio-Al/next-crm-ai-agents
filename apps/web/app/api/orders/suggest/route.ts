import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getDb } from "@/lib/db";
import { sql, eq, inArray } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isNilUuid(value: string | undefined): boolean {
  return value?.toLowerCase() === NIL_UUID;
}

/**
 * POST /api/orders/suggest — AI product recommendations for a contact OR account.
 *
 * Body:
 *   {
 *     contactId?: string,   // recommend for this contact
 *     accountId?: string,   // OR recommend for this account (aggregates all contacts)
 *     limit?: number,       // max suggestions (default 5)
 *     locale?: string,      // language for reasoning text
 *     explain?: boolean,    // if false, skip the LLM rerank step. default true
 *   }
 *
 * Flow (per the pgvector-embeddings skill, "Hybrid recommendation patterns"):
 *  1. Resolve subject (contact or account) and load its non-cancelled order items.
 *  2. Compute purchase centroid = AVG(product.embedding) over purchased products.
 *  3. Vector search: nearest products by cosine distance to centroid,
 *     EXCLUDING already-purchased items, filtering active/approved/in-stock.
 *  4. Fallback: if the subject has no embedded purchases yet, embed a text
 *     profile of the subject and run the same search.
 *  5. Optional LLM rerank with reasoning text per recommendation.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    contactId: contactIdInput,
    accountId: accountIdInput,
    limit: maxSuggestions = 5,
    locale,
    explain = true,
  } = body as {
    contactId?: string;
    accountId?: string;
    limit?: number;
    locale?: string;
    explain?: boolean;
  };

  let contactId = contactIdInput;
  let accountId = accountIdInput;

  if (!contactId && !accountId) {
    return NextResponse.json(
      { error: "contactId or accountId is required" },
      { status: 400 },
    );
  }

  if (contactId && !isUuid(contactId)) {
    return NextResponse.json(
      { error: "contactId must be a valid UUID" },
      { status: 400 },
    );
  }

  if (accountId && !isUuid(accountId)) {
    return NextResponse.json(
      { error: "accountId must be a valid UUID" },
      { status: 400 },
    );
  }

  // Reject nil UUIDs (invalid context)
  if (isNilUuid(contactId)) {
    // Nil contactId likely means no specific contact selected; fall back to accountId
    if (!accountId || isNilUuid(accountId)) {
      return NextResponse.json(
        { error: "No valid contact or account selected" },
        { status: 400 },
      );
    }
    // Clear nil contactId, use accountId path
    contactId = undefined;
  }

  if (isNilUuid(accountId)) {
    return NextResponse.json(
      { error: "accountId is not set" },
      { status: 400 },
    );
  }

  const db = getDb();

  // 1. Resolve subject for the text-profile fallback + display.
  let subjectName = "";
  let subjectTags: string[] = [];
  let subjectCompany: string | null = null;
  // Account associated with the contact — used to widen order history to
  // include account-scoped pedidos (which leave orders.contact_id NULL).
  let contactAccountId: string | null = null;

  if (contactId) {
    const contact = await db.query.contacts.findFirst({
      where: eq(schema.contacts.id, contactId),
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    subjectName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    subjectTags = contact.tags ?? [];
    subjectCompany = contact.companyName ?? null;
    contactAccountId = contact.accountId ?? null;
  } else if (accountId) {
    const account = await db.query.crmAccounts.findFirst({
      where: eq(schema.crmAccounts.id, accountId),
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    subjectName = account.name;
    subjectTags = account.tags ?? [];
  }

  // 2. Load order history for the subject (last 30 confirmed orders).
  // Confirmed = either manual flow (tasks.status='Completed' → orders.status='confirmed')
  // or SAP flow (estado_c in PEDIDO LIBERADO/ENTREGA CREADA/FACTURA CREADA).
  // For contactId: include account-scoped pedidos (contact_id is NULL on those)
  // by OR-matching orders.account_id = contact.account_id.
  const subjectFilter = contactId
    ? contactAccountId
      ? sql`(${schema.orders.contactId} = ${contactId} OR ${schema.orders.accountId} = ${contactAccountId})`
      : sql`${schema.orders.contactId} = ${contactId}`
    : sql`${schema.orders.accountId} = ${accountId}`;

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
    .where(sql`${subjectFilter} and ${schema.orders.status} = 'confirmed'`)
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .limit(30);

  const orderIds = orders.map((o) => o.id);

  let orderItems: Array<{
    orderId: string;
    productId: string | null;
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
        productId: schema.orderItems.productId,
        productName: schema.orderItems.productName,
        productSku: schema.orderItems.productSku,
        quantity: schema.orderItems.quantity,
        unitPrice: schema.orderItems.unitPrice,
        lineTotal: schema.orderItems.lineTotal,
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, orderIds));
  }

  const purchasedProductIds = Array.from(
    new Set(orderItems.map((i) => i.productId).filter((id): id is string => !!id)),
  );
  // Skus of already-purchased products. Because aos_products allows
  // duplicate SKUs (the SuiteCRM source has multiple rows per maincode),
  // excluding by product_id alone leaves SKU-duplicates of purchased items
  // in the result. Exclude by SKU as well.
  const purchasedSkus = Array.from(
    new Set(orderItems.map((i) => i.productSku).filter((s): s is string => !!s)),
  );

  // 3. Build candidates.
  type Candidate = {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    category: string | null;
    brand: string | null;
    familyName: string | null;
    price: string | null;
    currency: string | null;
    unit: string | null;
    available: string | null;
    tags: string[] | null;
    imageUrl: string | null;
    distance: number | null;
  };

  let candidateProducts: Candidate[] = [];
  let strategy: "centroid" | "text-profile" | "popularity" = "popularity";

  // Reusable exclusion of already-purchased products (by id and by SKU).
  const exclusionParts: ReturnType<typeof sql>[] = [];
  if (purchasedProductIds.length > 0) {
    exclusionParts.push(sql`AND p.id NOT IN (${sql.join(
      purchasedProductIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
  }
  if (purchasedSkus.length > 0) {
    exclusionParts.push(sql`AND (p.sku IS NULL OR p.sku NOT IN (${sql.join(
      purchasedSkus.map((s) => sql`${s}`),
      sql`, `,
    )}))`);
  }
  const exclusionList =
    exclusionParts.length > 0 ? sql.join(exclusionParts, sql` `) : sql``;

  // 3a. Preferred: centroid of purchased product embeddings.
  if (purchasedProductIds.length > 0) {
    const centroidQuery = sql`
      WITH centroid AS (
        SELECT AVG(p.embedding)::vector(1536) AS vec, COUNT(*) AS n
        FROM products p
        WHERE p.id IN (${sql.join(
          purchasedProductIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND p.embedding IS NOT NULL
      )
      SELECT
        p.id, p.name, p.sku, p.description, p.category, p.brand,
        p.family_name AS "familyName",
        p.price, p.currency, p.unit, p.available, p.tags,
        p.image_url AS "imageUrl",
        (p.embedding <=> c.vec) AS distance
      FROM products p, centroid c
      WHERE c.n > 0
        AND p.active = true
        AND p.embedding IS NOT NULL
        AND (p.approved IS NULL OR p.approved = true)
        AND (p.available IS NULL OR p.available::numeric > 0)
        AND (p.stock_qty IS NULL OR p.stock_qty > 0)
        ${exclusionList}
      ORDER BY p.embedding <=> c.vec ASC
      LIMIT 60
    `;
    const result = await db.execute(centroidQuery);
    if (result.rows.length > 0) {
      candidateProducts = result.rows as unknown as Candidate[];
      strategy = "centroid";
    }
  }

  // 3b. Text-profile fallback (no embedded purchases).
  if (candidateProducts.length === 0) {
    const profileText = buildProfileText({
      subjectName,
      subjectCompany,
      subjectTags,
      orders,
      orderItems,
    });

    try {
      const embedder = await openai.embedding("text-embedding-3-small");
      const { embeddings } = await embedder.doEmbed({ values: [profileText] });
      const profileEmbedding = embeddings[0];

      if (profileEmbedding) {
        const vectorStr = `[${profileEmbedding.join(",")}]`;
        const result = await db.execute(sql`
          SELECT
            p.id, p.name, p.sku, p.description, p.category, p.brand,
            p.family_name AS "familyName",
            p.price, p.currency, p.unit, p.available, p.tags,
            p.image_url AS "imageUrl",
            (p.embedding <=> ${vectorStr}::vector) AS distance
          FROM products p
          WHERE p.active = true
            AND p.embedding IS NOT NULL
            AND (p.approved IS NULL OR p.approved = true)
            AND (p.available IS NULL OR p.available::numeric > 0)
            AND (p.stock_qty IS NULL OR p.stock_qty > 0)
            ${exclusionList}
          ORDER BY p.embedding <=> ${vectorStr}::vector ASC
          LIMIT 60
        `);
        if (result.rows.length > 0) {
          candidateProducts = result.rows as unknown as Candidate[];
          strategy = "text-profile";
        }
      }
    } catch {
      // embedding unavailable — fall through to popularity
    }
  }

  // 3c. Last-resort popularity fallback.
  if (candidateProducts.length === 0) {
    const rows = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        description: schema.products.description,
        category: schema.products.category,
        brand: schema.products.brand,
        familyName: schema.products.familyName,
        price: schema.products.price,
        currency: schema.products.currency,
        unit: schema.products.unit,
        available: schema.products.available,
        tags: schema.products.tags,
        imageUrl: schema.products.imageUrl,
      })
      .from(schema.products)
      .where(sql`${schema.products.active} = true`)
      .limit(60);
    candidateProducts = rows.map((r) => ({ ...r, distance: null }));
    strategy = "popularity";
  }

  // Dedupe by SKU. aos_products has multiple rows per maincode (duplicate
  // SKUs are real in this source), so the vector search returns the same
  // logical product several times. Keep the closest-distance entry per SKU
  // and let products without a SKU through unchanged.
  if (candidateProducts.length > 0) {
    const seenSkus = new Set<string>();
    const deduped: Candidate[] = [];
    for (const p of candidateProducts) {
      const key = p.sku ?? `__id_${p.id}`;
      if (seenSkus.has(key)) continue;
      seenSkus.add(key);
      deduped.push(p);
    }
    candidateProducts = deduped;
  }

  if (candidateProducts.length === 0) {
    return NextResponse.json({
      suggestions: [],
      strategy,
      orderCount: orders.length,
      reasoningText: "No products available in the catalog.",
    });
  }

  // 4. Optional LLM rerank with reasoning per recommendation.
  if (!explain) {
    return NextResponse.json({
      strategy,
      orderCount: orders.length,
      purchasedProductCount: purchasedProductIds.length,
      suggestions: candidateProducts.slice(0, maxSuggestions).map((p) => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        familyName: p.familyName,
        price: p.price,
        currency: p.currency,
        imageUrl: p.imageUrl,
        distance: p.distance,
        reason: null,
      })),
    });
  }

  const profileText = buildProfileText({
    subjectName,
    subjectCompany,
    subjectTags,
    orders,
    orderItems,
  });

  const candidateList = candidateProducts
    .map(
      (p, i) =>
        `${i + 1}. ${p.name} (SKU ${p.sku ?? "n/a"}, ${p.brand ?? "no brand"}, ${p.familyName ?? p.category ?? "uncat"}) — $${p.price ?? "?"} — distance=${p.distance?.toFixed(4) ?? "n/a"}`,
    )
    .join("\n");

  const languageInstruction =
    locale && locale !== "en"
      ? `Respond in the language for locale "${locale}".`
      : "";

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are a sales intelligence AI. Given a client's purchase history and a list of candidate products (already pre-ranked by vector similarity to their purchase profile), recommend the top ${maxSuggestions} products they should buy next. For each recommendation, explain WHY based on their history. Be specific and actionable. Return valid JSON only. ${languageInstruction}`,
    prompt: `## Client Purchase Profile
${profileText}

## Candidate Products (ranked by vector similarity)
${candidateList}

Return a JSON array of objects with: { "index": <1-based number from the list>, "reason": "<specific reason tied to their history>" }
Return at most ${maxSuggestions} products. Only return the JSON array, no other text.`,
  });

  let suggestions: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    brand: string | null;
    category: string | null;
    familyName: string | null;
    price: string | null;
    currency: string | null;
    imageUrl: string | null;
    distance: number | null;
    reason: string;
  }> = [];

  try {
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const raw: Array<{ index: number; reason: string }> = JSON.parse(cleaned);
    suggestions = raw
      .map((s) => {
        const product = candidateProducts[s.index - 1];
        if (!product) return null;
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          brand: product.brand,
          category: product.category,
          familyName: product.familyName,
          price: product.price,
          currency: product.currency,
          imageUrl: product.imageUrl,
          distance: product.distance,
          reason: s.reason,
        };
      })
      .filter(Boolean) as typeof suggestions;
  } catch {
    suggestions = candidateProducts.slice(0, maxSuggestions).map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      brand: p.brand,
      category: p.category,
      familyName: p.familyName,
      price: p.price,
      currency: p.currency,
      imageUrl: p.imageUrl,
      distance: p.distance,
      reason: "Top vector-similarity match to purchase history.",
    }));
  }

  return NextResponse.json({
    strategy,
    orderCount: orders.length,
    purchasedProductCount: purchasedProductIds.length,
    suggestions,
  });
}

function buildProfileText(args: {
  subjectName: string;
  subjectCompany: string | null;
  subjectTags: string[];
  orders: Array<{
    id: string;
    number: string;
    status: string;
    totalAmount: string | null;
    currency: string | null;
    createdAt: Date | null;
  }>;
  orderItems: Array<{
    orderId: string;
    productName: string;
    quantity: number;
  }>;
}): string {
  const { subjectName, subjectCompany, subjectTags, orders, orderItems } = args;
  const parts: string[] = [
    `Client: ${subjectName}`,
    subjectCompany ? `Company: ${subjectCompany}` : null,
    subjectTags.length > 0 ? `Tags: ${subjectTags.join(", ")}` : null,
    `Orders: ${orders.length}`,
  ].filter((x): x is string => !!x);

  const itemsByOrder = new Map<string, typeof orderItems>();
  for (const item of orderItems) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  for (const order of orders.slice(0, 10)) {
    const items = itemsByOrder.get(order.id) ?? [];
    const itemsStr = items.map((i) => `${i.productName} x${i.quantity}`).join(", ");
    parts.push(
      `Order ${order.number} (${order.status}, ${order.totalAmount ?? "?"} ${order.currency ?? ""}): ${itemsStr}`,
    );
  }

  return parts.join("\n");
}
