---
name: pgvector-embeddings
description: 'Use when adding, modifying, or debugging the product embedding pipeline, pgvector semantic search, or any vector-similarity feature (recommendations, "similar to" queries, neighbor-based suggestions, hybrid search). Covers the CDC→Redis→BullMQ embedding flow, the `vector(1536)` schema, HNSW index, backfill scripts, and the `embed()` query pattern.'
---

# pgvector Embeddings Skill

End-to-end vector pipeline: SuiteCRM CDC → TimescaleDB → Redis list → BullMQ → OpenAI embeddings → pgvector → semantic search tool.

## Stack

- **TimescaleDB (Postgres 16)** with `vector` extension on port `6432` (PgBouncer)
- **`vector(1536)`** column on `products.embedding` ([packages/shared/src/db/schema.ts](packages/shared/src/db/schema.ts))
- **HNSW index**: `IX_products_embedding_hnsw ON products USING hnsw (embedding vector_cosine_ops)`
- **OpenAI** `text-embedding-3-small` (1536 dims) via AI SDK `embed()`
- **BullMQ 5** queue `product-embeddings` (Redis `noeviction` policy required)
- **Bridge**: Python writes Redis list `product-embeddings:pending`; Node `BLPOP` relays to BullMQ

## Architecture

```
Debezium CDC → Kafka → services/kafka-sync (Python)
                          │
                          │ psycopg2 UPSERT products
                          │ RPUSH product-embeddings:pending {productId, text}
                          ▼
                       Redis
                          │
                          │ BLPOP (blocking)
                          ▼
              packages/agent-worker (Node)
                  ├─ startPendingRelay()  → queue.add("product-embeddings", ...)
                  └─ Worker              → embed() → UPDATE products SET embedding
```

## Key Files

| Concern | File |
|---|---|
| Schema (`embedding vector(1536)`) | [packages/shared/src/db/schema.ts](packages/shared/src/db/schema.ts) |
| Custom Drizzle `vector` type | same file — `customType<{ data: number[] }>` returning `vector(1536)` |
| Python upsert + enqueue | [services/kafka-sync/sync_handler.py](services/kafka-sync/sync_handler.py) — `_enqueue_product_embedding` |
| Embedding worker + relay | [packages/agent-worker/src/embedding-worker.ts](packages/agent-worker/src/embedding-worker.ts) |
| Web search tool | [apps/web/app/api/chat/route.ts](apps/web/app/api/chat/route.ts) — `search_products_similar` |
| Agent-worker tool variant | [packages/agent-worker/src/skill-loader.ts](packages/agent-worker/src/skill-loader.ts) |

## Patterns

### Embedding query (in tool execute)

```ts
import { embed } from "ai";
import { sql } from "drizzle-orm";

const { embedding } = await embed({
  model: openai.embedding("text-embedding-3-small"),
  value: query,
});
const vectorLiteral = `[${embedding.join(",")}]`;

const result = await db.execute(sql`
  SELECT id, name, brand, embedding <=> ${vectorLiteral}::vector AS distance
  FROM products
  WHERE active = true AND embedding IS NOT NULL
  ORDER BY distance ASC
  LIMIT ${limit}
`);
```

Distance operators:
- `<=>` cosine distance (matches `vector_cosine_ops` HNSW index — use this)
- `<->` L2 / Euclidean
- `<#>` negative inner product

### Source text for embedding

Concatenate the most semantically meaningful fields. For products:
`name | brand | type | category | family_name | group_name | subgroup_name | description`

Keep order stable across re-embeds. Skip nulls. Lowercase optional (model is case-insensitive enough).

### Enqueue pattern (Python)

```python
EMBEDDING_PENDING_LIST = "product-embeddings:pending"
self.redis.rpush(EMBEDDING_PENDING_LIST, json.dumps({"productId": pid, "text": text}))
```

### Relay pattern (Node)

Use a **dedicated** ioredis connection for `BLPOP` (it blocks the connection):

```ts
const blocking = new Redis(REDIS_URL);
while (true) {
  const popped = await blocking.blpop(EMBEDDING_PENDING_LIST, 0);
  if (!popped) continue;
  const { productId, text } = JSON.parse(popped[1]);
  await queue.add(`embed-${productId}`, { productId, text }, {
    jobId: `embed-${productId}`,           // BullMQ forbids ":" in jobId
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
}
```

## Gotchas (learned the hard way)

- **BullMQ jobId cannot contain `:`** — use hyphen: `embed-${id}`, not `embed:${id}`.
- **Redis must be `noeviction`** — `allkeys-lru` causes BullMQ job loss. Configured in [infra/docker-compose.yml](infra/docker-compose.yml).
- **Don't reuse the BLPOP connection for other commands** — it stays blocked.
- **`drizzle-kit push` requires a TTY** for the down-arrow confirmation prompt. On Windows MINGW64 this hangs. Apply schema SQL directly via `docker exec -i crm-agent-postgres psql -U platform -d platform` with `ADD COLUMN IF NOT EXISTS` for forward-compat.
- **Backfill in one pipeline**, not a bash loop — `docker exec -i` consumes outer pipe stdin. Pattern that works:
  ```bash
  docker exec -i crm-agent-postgres psql -U platform -d platform -At -c "
    SELECT 'RPUSH product-embeddings:pending ' || quote_literal(json_build_object(
      'productId', id::text, 'text', concat_ws(' | ', name, brand, ...)
    )::text)
    FROM products WHERE embedding IS NULL
  " | docker exec -i crm-agent-redis redis-cli
  ```
- **Root `.env` loading**: use `tsx --env-file=../../.env` for Node and `load_dotenv(Path(__file__).resolve().parents[2] / ".env")` for Python.
- **Tool registration is per-route** — `search_products_similar` defined in `agent-worker/skill-loader.ts` is NOT visible to the web `/api/chat` route. Each surface registers its own tool list.

## Adding a new vector-search feature

For e.g. **"find similar contacts"** or **"recommend products from neighbor purchases"**:

1. Add `embedding vector(1536)` column to the target table (Drizzle custom type).
2. Apply migration via `docker exec` (not drizzle-kit push on Windows).
3. Create HNSW index: `CREATE INDEX IX_<table>_embedding_hnsw ON <table> USING hnsw (embedding vector_cosine_ops);`
4. Generate source text in `sync_handler.py` (or backfill SQL) and `RPUSH` to a new Redis list (e.g. `contact-embeddings:pending`).
5. Add a parallel Worker + relay in `embedding-worker.ts` (factor out a `createEmbeddingPipeline({ list, queue, table, column })` helper if doing more than one).
6. Register the search tool in [apps/web/app/api/chat/route.ts](apps/web/app/api/chat/route.ts) and update the system prompt to steer the LLM toward it. See the `agent-tool-design` skill.

## Hybrid recommendation patterns (future)

For "recommend products to contact based on order history + neighbors":

- **Average-pool the contact's purchased product embeddings** → query for nearest products excluding already-purchased.
  ```sql
  WITH contact_centroid AS (
    SELECT AVG(p.embedding)::vector AS vec
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.contact_id = $1 AND p.embedding IS NOT NULL
  )
  SELECT p.* FROM products p, contact_centroid c
  WHERE p.embedding IS NOT NULL
    AND p.id NOT IN (SELECT product_id FROM ... contact's purchases)
  ORDER BY p.embedding <=> c.vec ASC LIMIT 10;
  ```
- **Neighbor-based (collaborative)**: find contacts with similar purchase vectors → recommend products *they* bought that the target hasn't.
- **Re-rank**: combine vector distance with business signals (`available > 0`, `approved = true`, `min_price` window).
