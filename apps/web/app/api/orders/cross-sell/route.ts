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
 * POST /api/orders/cross-sell — Collaborative "peers also bought" recommender.
 *
 * Body:
 *   {
 *     accountId?: string,    // subject account
 *     contactId?: string,    // resolved to its accountId; provide one or the other
 *     limit?: number,        // max suggestions (default 5)
 *     peerCount?: number,    // K neighbors to consider (default 10)
 *     peerFilter?: "strict" | "loose" | "auto",  // default "auto"
 *     minPeerCount?: number, // suppress products bought by fewer than N peers (default 2)
 *     locale?: string,
 *     explain?: boolean,     // LLM rerank with reasons (default true)
 *   }
 *
 * Strategy: peer-centroid (collaborative filtering on purchase vectors).
 *  1. Build subject's centroid from confirmed-order purchases with embeddings.
 *  2. Find K nearest peer accounts by centroid<=>centroid distance.
 *  3. Aggregate products those peers bought that the subject hasn't.
 *  4. SKU-dedupe (aos_products has duplicate maincodes).
 *  5. LLM rerank with peer-aware reasons.
 *
 * Falls back to strategy "no-history" when the subject has zero embedded
 * purchases (caller should defer to /api/orders/suggest in that case).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    accountId: rawAccountIdInput,
    contactId: contactIdInput,
    limit: maxSuggestions = 5,
    peerCount = 10,
    peerFilter = "auto",
    minPeerCount = 2,
    locale,
    explain = true,
  } = body as {
    accountId?: string;
    contactId?: string;
    limit?: number;
    peerCount?: number;
    peerFilter?: "strict" | "loose" | "auto";
    minPeerCount?: number;
    locale?: string;
    explain?: boolean;
  };

  let rawAccountId = rawAccountIdInput;
  let contactId = contactIdInput;

  if (!rawAccountId && !contactId) {
    return NextResponse.json(
      { error: "accountId or contactId is required" },
      { status: 400 },
    );
  }
  if (rawAccountId && !isUuid(rawAccountId)) {
    return NextResponse.json(
      { error: "accountId must be a valid UUID" },
      { status: 400 },
    );
  }
  if (contactId && !isUuid(contactId)) {
    return NextResponse.json(
      { error: "contactId must be a valid UUID" },
      { status: 400 },
    );
  }

  // Reject nil UUIDs (invalid context)
  if (isNilUuid(rawAccountId)) {
    rawAccountId = undefined;
  }
  if (isNilUuid(contactId)) {
    contactId = undefined;
  }

  if (!rawAccountId && !contactId) {
    return NextResponse.json(
      { error: "No valid account or contact selected" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Resolve subject account.
  let accountId = rawAccountId ?? null;
  if (!accountId && contactId) {
    const contact = await db.query.contacts.findFirst({
      where: eq(schema.contacts.id, contactId),
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    if (!contact.accountId) {
      return NextResponse.json({
        strategy: "no-history",
        subjectAccount: null,
        peerAccounts: [],
        subjectOrderCount: 0,
        subjectPurchasedProductCount: 0,
        suggestions: [],
        reasoningText: "Contact has no associated account — no peers to compare against.",
      });
    }
    accountId = contact.accountId;
  }

  const account = await db.query.crmAccounts.findFirst({
    where: eq(schema.crmAccounts.id, accountId!),
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const accountWorkspaceId = account.workspaceId;
  const subjectAccountId = account.id;

  // 1. Load subject's confirmed orders + items.
  const subjectOrders = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      totalAmount: schema.orders.totalAmount,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
      regionCode: schema.orders.regionCode,
    })
    .from(schema.orders)
    .where(
      sql`${schema.orders.accountId} = ${accountId} AND ${schema.orders.status} = 'confirmed'`,
    )
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .limit(30);

  const subjectOrderIds = subjectOrders.map((o) => o.id);
  let subjectItems: Array<{
    productId: string | null;
    productName: string;
    productSku: string | null;
    quantity: number;
  }> = [];
  if (subjectOrderIds.length > 0) {
    subjectItems = await db
      .select({
        productId: schema.orderItems.productId,
        productName: schema.orderItems.productName,
        productSku: schema.orderItems.productSku,
        quantity: schema.orderItems.quantity,
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, subjectOrderIds));
  }

  const purchasedProductIds = Array.from(
    new Set(subjectItems.map((i) => i.productId).filter((id): id is string => !!id)),
  );
  const purchasedSkus = Array.from(
    new Set(subjectItems.map((i) => i.productSku).filter((s): s is string => !!s)),
  );

  // 2. Subject centroid availability check (no-history fallback).
  if (purchasedProductIds.length === 0) {
    return NextResponse.json({
      strategy: "no-history",
      subjectAccount: { id: account.id, name: account.name },
      peerAccounts: [],
      subjectOrderCount: subjectOrders.length,
      subjectPurchasedProductCount: 0,
      suggestions: [],
      reasoningText:
        "Subject has no embedded purchase history — use /api/orders/suggest for content-based fallback.",
    });
  }

  // Region filter — pick the most common region from the subject's orders.
  const regionCounts = new Map<string, number>();
  for (const o of subjectOrders) {
    if (o.regionCode) {
      regionCounts.set(o.regionCode, (regionCounts.get(o.regionCode) ?? 0) + 1);
    }
  }
  const subjectRegion = [...regionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Reusable exclusion fragment for the subject's already-purchased products.
  const exclusionParts: ReturnType<typeof sql>[] = [];
  exclusionParts.push(sql`AND p.id NOT IN (${sql.join(
    purchasedProductIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`);
  if (purchasedSkus.length > 0) {
    exclusionParts.push(sql`AND (p.sku IS NULL OR p.sku NOT IN (${sql.join(
      purchasedSkus.map((s) => sql`${s}`),
      sql`, `,
    )}))`);
  }
  const exclusionList = sql.join(exclusionParts, sql` `);

  type Peer = { accountId: string; accountName: string; distance: number; orderCount: number };

  // Resolve peers — single query that builds subject + peer centroids inline.
  // Uses HNSW indirectly through `<=>` on the live centroid expression. For
  // workspaces with many accounts this may need materialization (see Phase 6
  // in the plan); for now it's pure SQL.
  async function findPeers(applyRegionFilter: boolean): Promise<Peer[]> {
    const regionFilter =
      applyRegionFilter && subjectRegion
        ? sql`AND o.region_code = ${subjectRegion}`
        : sql``;

    const result = await db.execute(sql`
      WITH subject_centroid AS (
        SELECT AVG(p.embedding)::vector(1536) AS vec
        FROM products p
        WHERE p.id IN (${sql.join(
          purchasedProductIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND p.embedding IS NOT NULL
      ),
      peer_centroids AS (
        SELECT
          o.account_id,
          AVG(p.embedding)::vector(1536) AS vec,
          COUNT(DISTINCT o.id) AS order_count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.workspace_id = ${accountWorkspaceId}
          AND o.status = 'confirmed'
          AND o.account_id IS NOT NULL
          AND o.account_id <> ${subjectAccountId}::uuid
          AND p.embedding IS NOT NULL
          ${regionFilter}
        GROUP BY o.account_id
        HAVING COUNT(DISTINCT o.id) >= 1
      )
      SELECT
        pc.account_id AS "accountId",
        a.name AS "accountName",
        (pc.vec <=> sc.vec) AS distance,
        pc.order_count AS "orderCount"
      FROM peer_centroids pc
      JOIN crm_accounts a ON a.id = pc.account_id
      CROSS JOIN subject_centroid sc
      ORDER BY pc.vec <=> sc.vec ASC
      LIMIT ${peerCount}
    `);
    return result.rows as unknown as Peer[];
  }

  // peerFilter routing.
  let peers: Peer[] = [];
  let appliedFilter: "strict" | "loose" = "loose";
  if (peerFilter === "strict") {
    peers = await findPeers(true);
    appliedFilter = "strict";
  } else if (peerFilter === "loose") {
    peers = await findPeers(false);
    appliedFilter = "loose";
  } else {
    // auto: try strict, fall back to loose if too few peers.
    if (subjectRegion) {
      peers = await findPeers(true);
      appliedFilter = "strict";
    }
    if (peers.length < 3) {
      peers = await findPeers(false);
      appliedFilter = "loose";
    }
  }

  if (peers.length === 0) {
    return NextResponse.json({
      strategy: "peer-centroid",
      subjectAccount: { id: account.id, name: account.name },
      peerAccounts: [],
      peerFilter: appliedFilter,
      subjectRegion,
      subjectOrderCount: subjectOrders.length,
      subjectPurchasedProductCount: purchasedProductIds.length,
      suggestions: [],
      reasoningText: "No similar accounts with embedded purchase history found.",
    });
  }

  const peerIds = peers.map((p) => p.accountId);
  const peerDistanceById = new Map(peers.map((p) => [p.accountId, p.distance]));

  // 3. Aggregate products purchased by peers but not the subject.
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
    peerCount: number;
    avgPeerDistance: number;
    totalQuantity: number;
  };

  const candidatesResult = await db.execute(sql`
    SELECT
      p.id, p.name, p.sku, p.description, p.category, p.brand,
      p.family_name AS "familyName",
      p.price, p.currency, p.unit, p.available, p.tags,
      p.image_url AS "imageUrl",
      COUNT(DISTINCT o.account_id) AS "peerCount",
      AVG(
        CASE
          ${sql.join(
            peers.map(
              (peer) =>
                sql`WHEN o.account_id = ${peer.accountId}::uuid THEN ${peer.distance}::float`,
            ),
            sql` `,
          )}
        END
      ) AS "avgPeerDistance",
      SUM(oi.quantity) AS "totalQuantity"
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.account_id IN (${sql.join(
      peerIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      AND o.status = 'confirmed'
      AND p.active = true
      AND p.embedding IS NOT NULL
      AND (p.approved IS NULL OR p.approved = true)
      AND (p.available IS NULL OR p.available::numeric > 0)
      AND (p.stock_qty IS NULL OR p.stock_qty > 0)
      ${exclusionList}
    GROUP BY p.id
    ORDER BY COUNT(DISTINCT o.account_id) DESC, AVG(
      CASE
        ${sql.join(
          peers.map(
            (peer) =>
              sql`WHEN o.account_id = ${peer.accountId}::uuid THEN ${peer.distance}::float`,
          ),
          sql` `,
        )}
      END
    ) ASC
    LIMIT 60
  `);

  // peerDistanceById is intentionally referenced via the sql CASE expression
  // above; this line keeps TS happy when the variable is otherwise unused.
  void peerDistanceById;

  let candidates = candidatesResult.rows as unknown as Candidate[];

  // 4. SKU dedupe — keep first occurrence (preserves peerCount/distance ranking).
  if (candidates.length > 0) {
    const seen = new Set<string>();
    const deduped: Candidate[] = [];
    for (const c of candidates) {
      const key = c.sku ?? `__id_${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c);
    }
    candidates = deduped;
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      strategy: "peer-centroid",
      subjectAccount: { id: account.id, name: account.name },
      peerAccounts: peers,
      peerFilter: appliedFilter,
      subjectRegion,
      subjectOrderCount: subjectOrders.length,
      subjectPurchasedProductCount: purchasedProductIds.length,
      suggestions: [],
      reasoningText: "Peer accounts haven't bought any products this account hasn't already.",
    });
  }

  // 5. LLM rerank.
  // The candidate list passed to the LLM is filtered to peerCount >= minPeerCount,
  // but the API still returns weaker (peerCount=1) signals so callers can choose.
  if (!explain) {
    return NextResponse.json({
      strategy: "peer-centroid",
      subjectAccount: { id: account.id, name: account.name },
      peerAccounts: peers,
      peerFilter: appliedFilter,
      subjectRegion,
      subjectOrderCount: subjectOrders.length,
      subjectPurchasedProductCount: purchasedProductIds.length,
      suggestions: candidates.slice(0, maxSuggestions).map((c) => ({
        productId: c.id,
        productName: c.name,
        sku: c.sku,
        brand: c.brand,
        category: c.category,
        familyName: c.familyName,
        price: c.price,
        currency: c.currency,
        imageUrl: c.imageUrl,
        peerCount: Number(c.peerCount),
        avgPeerDistance: Number(c.avgPeerDistance),
        reason: null,
      })),
    });
  }

  const candidateForLLM = candidates.filter(
    (c) => Number(c.peerCount) >= minPeerCount,
  );
  const candidatesToExplain =
    candidateForLLM.length > 0 ? candidateForLLM : candidates;

  const subjectProfile = buildSubjectProfile({
    accountName: account.name,
    industry: account.industry ?? null,
    tags: account.tags ?? [],
    orderCount: subjectOrders.length,
    purchasedProductNames: subjectItems
      .map((i) => i.productName)
      .filter((n, i, a) => a.indexOf(n) === i)
      .slice(0, 25),
  });

  const candidateList = candidatesToExplain
    .slice(0, 30)
    .map((c, i) => {
      const peersN = Number(c.peerCount);
      const dist = Number(c.avgPeerDistance);
      return `${i + 1}. ${c.name} (SKU ${c.sku ?? "n/a"}, ${c.brand ?? "no brand"}, ${c.familyName ?? c.category ?? "uncat"}) — bought by ${peersN} peer${peersN === 1 ? "" : "s"}, avg peer distance=${dist.toFixed(4)}`;
    })
    .join("\n");

  const peerSummary = peers
    .slice(0, peerCount)
    .map((p) => `- ${p.accountName} (${p.orderCount} orders, distance=${Number(p.distance).toFixed(4)})`)
    .join("\n");

  const languageInstruction =
    locale && locale !== "en"
      ? `Respond in the language for locale "${locale}".`
      : "";

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are a B2B sales intelligence AI specialised in collaborative cross-sell. Given a subject account's profile, a set of peer accounts identified as similar by purchase-vector analysis, and products those peers bought that the subject hasn't, recommend the top ${maxSuggestions} cross-sell candidates. For each, explain WHY based on peer evidence (how many peers bought it, what makes them similar). Be specific. Return valid JSON only. ${languageInstruction}`,
    prompt: `## Subject Account
${subjectProfile}

## Similar Peer Accounts (ranked by purchase-vector distance)
${peerSummary}

## Candidate Products (peers bought, subject hasn't)
${candidateList}

Return a JSON array: [{ "index": <1-based number from candidate list>, "reason": "<peer-evidence-based reason>" }]
Return at most ${maxSuggestions} entries. Only the JSON array, no other text.`,
  });

  type Suggestion = {
    productId: string;
    productName: string;
    sku: string | null;
    brand: string | null;
    category: string | null;
    familyName: string | null;
    price: string | null;
    currency: string | null;
    imageUrl: string | null;
    peerCount: number;
    avgPeerDistance: number;
    reason: string;
  };

  let suggestions: Suggestion[] = [];

  try {
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const raw: Array<{ index: number; reason: string }> = JSON.parse(cleaned);
    suggestions = raw
      .map((s) => {
        const c = candidatesToExplain[s.index - 1];
        if (!c) return null;
        return {
          productId: c.id,
          productName: c.name,
          sku: c.sku,
          brand: c.brand,
          category: c.category,
          familyName: c.familyName,
          price: c.price,
          currency: c.currency,
          imageUrl: c.imageUrl,
          peerCount: Number(c.peerCount),
          avgPeerDistance: Number(c.avgPeerDistance),
          reason: s.reason,
        };
      })
      .filter((s): s is Suggestion => !!s);
  } catch {
    suggestions = candidatesToExplain.slice(0, maxSuggestions).map((c) => ({
      productId: c.id,
      productName: c.name,
      sku: c.sku,
      brand: c.brand,
      category: c.category,
      familyName: c.familyName,
      price: c.price,
      currency: c.currency,
      imageUrl: c.imageUrl,
      peerCount: Number(c.peerCount),
      avgPeerDistance: Number(c.avgPeerDistance),
      reason: `Bought by ${Number(c.peerCount)} similar account${Number(c.peerCount) === 1 ? "" : "s"}.`,
    }));
  }

  return NextResponse.json({
    strategy: "peer-centroid",
    subjectAccount: { id: account.id, name: account.name },
    peerAccounts: peers,
    peerFilter: appliedFilter,
    subjectRegion,
    subjectOrderCount: subjectOrders.length,
    subjectPurchasedProductCount: purchasedProductIds.length,
    suggestions,
  });
}

function buildSubjectProfile(args: {
  accountName: string;
  industry: string | null;
  tags: string[];
  orderCount: number;
  purchasedProductNames: string[];
}): string {
  const { accountName, industry, tags, orderCount, purchasedProductNames } = args;
  const parts = [
    `Account: ${accountName}`,
    industry ? `Industry: ${industry}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    `Confirmed orders: ${orderCount}`,
    purchasedProductNames.length > 0
      ? `Recent purchases: ${purchasedProductNames.join("; ")}`
      : null,
  ].filter((s): s is string => !!s);
  return parts.join("\n");
}
