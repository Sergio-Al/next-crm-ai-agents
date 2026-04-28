---
name: cdc-sync
description: 'Use when adding, modifying, or debugging the SuiteCRM → TimescaleDB CDC sync — including new entity transformers, custom-field (`_cstm`) handlers, FK resolution, snapshot vs streaming ordering, schema migrations on the target tables, or extending downstream side-effects (like embedding enqueue) from the upsert path.'
---

# CDC Sync Skill

Debezium → Kafka → Python sync service → TimescaleDB. Covers transformer + sync_handler patterns, custom-field promotion, and how to wire side-effects (embedding enqueue, notifications, etc.) into upserts.

## Stack

- **Debezium SQL Server connector** → topic per source table (e.g. `aos_products`, `aos_products_cstm`)
- **Python service**: [services/kafka-sync/](services/kafka-sync/) — `confluent-kafka` consumer + `psycopg2` upserts
- **Target**: TimescaleDB (Postgres 16) via PgBouncer port `6432`
- **Schema source of truth**: [packages/shared/src/db/schema.ts](packages/shared/src/db/schema.ts) (Drizzle)

## File responsibilities

| File | Job |
|---|---|
| [main.py](services/kafka-sync/main.py) | Kafka consumer loop, env loading (`.env` from repo root via `Path(__file__).resolve().parents[2]`) |
| [consumer.py](services/kafka-sync/consumer.py) | Kafka subscription + message dispatch |
| [transformer.py](services/kafka-sync/transformer.py) | Debezium payload → DB row dict. One function per source entity. Registered in `TRANSFORMERS` dict. |
| [sync_handler.py](services/kafka-sync/sync_handler.py) | DB UPSERT logic, FK resolution, side-effects (e.g. embedding enqueue). Dispatches by entity name. |

## Adding a new entity

### 1. Transformer (`transformer.py`)

```python
def transform_my_entity(payload: dict) -> dict | None:
    op = payload.get("op")
    if op == "d":
        return {"_op": "delete", "external_id": payload["before"]["id"]}
    after = payload.get("after") or {}
    if not after:
        return None
    return {
        "external_id": after["id"],
        "name": after.get("name"),
        "created_at": _epoch_ms_to_iso(after.get("date_entered")),
        # ... map fields
    }

TRANSFORMERS = {
    # ...
    "my-entity": transform_my_entity,
}
```

Helpers already defined: `_to_float`, `_to_int`, `_to_bool`, `_epoch_ms_to_iso`.

### 2. Custom fields (`_cstm` table) pattern

SuiteCRM splits standard cols and custom cols across `<entity>` and `<entity>_cstm` tables sharing the same `id`. Pattern:

- **Promote** specific `*_c` columns to first-class columns in the target schema (e.g. `min_price`, `family_id`).
- **Bag the rest** into a `custom_fields jsonb` column.
- **Map** booleans/enums where the SuiteCRM string convention differs (`estado_c = "1"` → `active = true`).

```python
def transform_product_cstm(payload):
    after = (payload.get("after") or {}).copy()
    if not after.get("id_c"):
        return None
    promoted = {
        "external_id": after.pop("id_c"),
        "min_price": _to_float(after.pop("precio_min_c", None)),
        "family_id": after.pop("familia_id_c", None),
        "active": _to_bool(after.pop("estado_c", None)),
        # ...
    }
    return {**promoted, "custom_fields": {k: v for k, v in after.items() if v is not None}}
```

### 3. Sync handler (`sync_handler.py`)

For `_cstm` entities, prefer **UPDATE-only** (don't INSERT). The base table arrives separately; if it's missing, log debug and skip:

```python
def _handle_my_entity_cstm(self, row):
    cur.execute(
        "UPDATE my_entities SET min_price = %s, ... WHERE external_id = %s RETURNING id",
        (row["min_price"], row["external_id"]),
    )
    if cur.rowcount == 0:
        log.debug("cstm row arrived before base row: %s", row["external_id"])
```

Snapshot vs streaming may deliver `_cstm` before base — that's expected. Don't error.

### 4. Dispatch (`_dispatch`)

```python
elif entity == "my-entity":
    self._upsert_my_entity(row)
elif entity == "my-entity-cstm":
    self._handle_my_entity_cstm(row)
```

### 5. Schema (`schema.ts`)

Add columns + indexes in [packages/shared/src/db/schema.ts](packages/shared/src/db/schema.ts). Apply via `docker exec` (drizzle-kit push hangs on Windows due to TTY prompt):

```bash
docker exec -i crm-agent-postgres psql -U platform -d platform <<'SQL'
BEGIN;
ALTER TABLE my_entities
  ADD COLUMN IF NOT EXISTS min_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS family_id text;
CREATE INDEX IF NOT EXISTS IX_my_entities_family ON my_entities(family_id);
COMMIT;
SQL
```

Always `IF NOT EXISTS` for forward-compat with environments that already migrated.

## Wiring side-effects (e.g. embedding enqueue)

Add to the upsert path with `RETURNING id`, then call the side-effect:

```python
cur.execute(
    """
    INSERT INTO products (workspace_id, external_id, name, ...)
    VALUES (%s, %s, %s, ...)
    ON CONFLICT (workspace_id, external_id) DO UPDATE SET ...
    RETURNING id
    """,
    (...)
)
result = cur.fetchone()
self._enqueue_product_embedding(result[0], row["external_id"])
```

Side-effect helpers should be **lazy** and **optional**:

```python
def __init__(self, dsn, workspace_id, redis_url=None):
    self._redis = None
    self._redis_url = redis_url

@property
def redis(self):
    if self._redis is None and self._redis_url:
        import redis  # lazy
        self._redis = redis.Redis.from_url(self._redis_url)
    return self._redis

def _enqueue_product_embedding(self, pid, external_id):
    if not self.redis:
        return
    text = self._build_product_embedding_text(pid)
    self.redis.rpush(EMBEDDING_PENDING_LIST, json.dumps({"productId": str(pid), "text": text}))
```

This way the sync still works without Redis configured.

## FK resolution

When the source has `account_id` referencing another SuiteCRM record, look up the platform UUID:

```python
cur.execute("SELECT id FROM accounts WHERE workspace_id = %s AND external_id = %s",
            (self.workspace_id, row["account_external_id"]))
fk = cur.fetchone()
account_id = fk[0] if fk else None
```

If FK target hasn't synced yet, store NULL (snapshot ordering doesn't guarantee parents-first across topics). A periodic reconciliation job can backfill.

`_resolve_fk` increments `self._skip_counts[(table, "fk_not_found")]` whenever a non-null `external_id` fails to resolve, so misses surface in the periodic INFO summary instead of disappearing into DEBUG. Custom skip reasons (e.g. `task_pedido_missing` in `_upsert_task`) follow the same pattern — bump the counter once per skip, keep the per-event message at DEBUG.

## Batch ordering (consumer.py)

`_process_batch` sorts each batch by **entity tier** before dispatching, so within a single Kafka poll cycle parents are upserted before children. Tiers are declared in `ENTITY_TIERS`:

| Tier | Entities | Why |
|---|---|---|
| 0 | `account`, `contact`, `product`, `modelo` | Roots — no in-batch FK deps |
| 1 | `account-cstm`, `product-cstm`, `account-contact`, `email-address`, `email-rel` | Enrich/link tier-0 rows |
| 2 | `pedido`, `invoice`, `modelo-product`, `visit` | Need tier-0/1 to resolve account/contact/product |
| 3 | `product-quote`, `task`, `stock` | Line items / status events on tier-2 rows |

Unknown entities go to a synthetic last tier (`max(tier)+1`) so an unrecognised topic never blocks known dependencies. The sort is **stable** — when adding a new entity, place it in the lowest tier that still holds its FK invariants.

This only fixes ordering **within a batch**. It does not solve cross-batch ordering — a `product-quote` whose parent pedido is still queued in a later batch will still skip. That's what the offset-reset playbook below is for.

## Observability: FK skip summary

`SyncHandler.flush_stats()` is called by the consumer after every batch commit. It emits one INFO line summarising any FK / parent-not-found skips since the last flush, then resets the counter:

```
FK skip summary: orders:fk_not_found=12, orders:task_pedido_missing=3
```

No line is emitted when there were zero skips, so a clean log means the sync is in steady state. To monitor a replay:

```bash
grep "FK skip summary" logs/kafka-sync.log | tail -20
```

## Gotchas

- **Debezium `op` field**: `c` = create, `u` = update, `d` = delete, `r` = snapshot read. Treat `c`, `u`, `r` as upsert.
- **Timestamps**: SuiteCRM date_entered/modified are epoch ms — convert with `_epoch_ms_to_iso`.
- **`_cstm` rows can arrive before base** during snapshot. UPDATE-only + debug log; don't ERROR.
- **`RETURNING id` requires fetchone()** — easy to forget after `ON CONFLICT DO UPDATE`.
- **Don't UPSERT `_cstm`** — you'd create orphan rows the base sync would clobber.
- **Workspace scoping**: every UPSERT/UPDATE must include `workspace_id` in the predicate. There's no global tenancy.
- **Stale lookup tables outlive a wipe.** `suite_reco.kunnr_lookup` (and any similar derived table) must be cleared whenever you wipe `crm_accounts`, otherwise it points to dead UUIDs and pedido upserts hit FK violations on `orders.account_id`. `_resolve_account_by_kunnr` now JOINs `crm_accounts` defensively, but always purge orphans:
  ```sql
  DELETE FROM suite_reco.kunnr_lookup k
  WHERE NOT EXISTS (SELECT 1 FROM crm_accounts a WHERE a.id = k.account_id);
  ```
- **Don't add unique constraints on natural keys.** `aos_products` has duplicate `maincode` SKUs in the source, and `hanpe_pedidos.nro_pedido_c` collides with `aos_invoices.number` on the shared `orders` table. Both `IX_products_sku` and `IX_orders_number` are non-unique on purpose. The real uniqueness lives on `(workspace_id, external_source, external_id)`.
- **SKU-level dedup happens at query time, not in the sync.** Because of the above, the recommendation API ([apps/web/app/api/orders/suggest/route.ts](apps/web/app/api/orders/suggest/route.ts)) excludes purchased products by SKU as well as by id, and dedupes candidates by SKU before returning.

## Replay & recovery playbook

Snapshot ordering is **not** guaranteed across topics. Children (product-quotes, tasks, account-cstm) routinely arrive before parents (pedidos, products, accounts). The sync layer logs and skips at DEBUG when an FK can't be resolved — it does **not** retry. The remediation is offset reset + replay.

### Diagnostic queries

```sql
-- Pedido pipeline health
SELECT status, status_source, COUNT(*) FROM orders
WHERE id IN (SELECT order_id FROM suite_reco.pedidos) GROUP BY 1,2;

-- Item linkage
SELECT COUNT(*) AS items, COUNT(product_id) AS linked FROM order_items;

-- Stale lookup rows (account wipe didn't cascade)
SELECT COUNT(*) FROM suite_reco.kunnr_lookup k
WHERE NOT EXISTS (SELECT 1 FROM crm_accounts a WHERE a.id = k.account_id);
```

In `logs/kafka-sync.log`:

```bash
grep "FK skip summary"                                  logs/kafka-sync.log | tail
grep -c "ForeignKeyViolation"                          logs/kafka-sync.log
grep -c "Skipping order_item .* parent order .* not found" logs/kafka-sync.log
grep -c "task .* Completed but no draft pedido"        logs/kafka-sync.log
```

The `FK skip summary` line is emitted by `SyncHandler.flush_stats()` after every batch commit when any skip counter is non-zero. A run that ends with no recent summary lines = steady state.

### Reset a topic offset (Kafka container)

```bash
/opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group crm-sync \
  --reset-offsets --to-earliest \
  --topic crm.{TENANT}.{entity}.updated \
  --execute
```

**Stop kafka-sync first** — Kafka refuses the reset while a member of the group is connected. Then restart with `pnpm sync:dev`.

### Replay order

When recovering from a full snapshot mishap, replay parents before children to keep DEBUG-skip noise minimal:

1. `account` + `account-cstm` (seeds `kunnr_lookup`)
2. `contact`, `account-contact`, `email-address`, `email-rel`
3. `product` + `product-cstm` (seeds `products`; embeddings enqueue here)
4. `modelo` + `modelo-product`
5. `pedido` (creates `orders` rows that order_items will join to)
6. `invoice`
7. `product-quote` (creates `order_items`)
8. `task` (flips `draft → confirmed` via `bean_type='HANPE_Pedidos'` + `status='Completed'`)
9. `stock`

Single-entity replays (the common case) only need to reset that topic; you don't have to redo the whole chain.

### Pre-replay cleanup

Some upserts use `INSERT ... ON CONFLICT DO UPDATE` and won't be re-touched if the row already exists with stale data. When the previous run produced partial children, delete them so the replay actually re-runs the upsert:

```sql
-- Pedido replay: drop pedido-side rows so suite_reco.pedidos re-fills
DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM suite_reco.pedidos);
DELETE FROM suite_reco.pedidos;
DELETE FROM orders WHERE number LIKE 'HCRM000000\_%' ESCAPE '\';

-- After an account wipe — always
DELETE FROM suite_reco.kunnr_lookup k
WHERE NOT EXISTS (SELECT 1 FROM crm_accounts a WHERE a.id = k.account_id);
```

`order_items` upserts on `(order_id, external_source, external_id)`, so a product-quote topic replay re-runs idempotently — no manual cleanup needed unless you also wiped pedidos.

### Verification

After replay, expect:

- 0 new `ForeignKeyViolation` lines in the log slice.
- `suite_reco.pedidos` count ≈ count of `hanpe_pedidos` whose `kunnr_c` matches an account (`SELECT COUNT(*) FROM hanpe_pedidos JOIN accounts ON sic_code = kunnr_c` in the source).
- `confirmed/manual` count ≈ count of `tasks` with `status='Completed'` and `parent_type='HANPE_Pedidos'` whose `bean_id` exists in `orders`.
- `order_items.linked / items` ratio close to 1.0 (a few percent gap is expected for products that never made it into `aos_products`).

## Related skills

- **`pgvector-embeddings`** — how the enqueue → BullMQ → embedding flow works downstream
- **`agent-tool-design`** — exposing CDC-synced data via AI SDK tools
