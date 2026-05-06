# CRM Agent Platform

A distributed conversational agent CRM platform built with Next.js, TimescaleDB, Redis, and AI SDK.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 8
- **Docker** & **Docker Compose**
- **Python** >= 3.11 (for the Kafka sync service)

## Project Structure

```
apps/
  web/             → Next.js 15 dashboard (port 3100)
    i18n/            → next-intl routing, request config, navigation
    messages/        → Translation files (en.json, es.json)
    middleware.ts    → Locale detection & redirect
packages/
  shared/          → Drizzle ORM schema (incl. products, orders, pgvector), shared types
  gateway/         → WebSocket gateway
  agent-worker/    → BullMQ agent worker
  channel-adapters/→ Channel adapter layer
services/
  kafka-sync/      → Python CDC sync service (SuiteCRM → TimescaleDB)
skills/            → Agent-worker skills (SKILL.md + tools.ts per folder)
  crm/             → CRM tools (search/log activity, semantic product search)
  design-tokens/   → Design system context (no tools)
  i18n/            → i18n conventions (no tools)
  openui/          → openui-lang conventions (no tools)
  custom/          → Template — ignored by the loader
  browser/         → Stub — ignored by the loader
infra/
  docker-compose.yml        → TimescaleDB + pgvector, PgBouncer, Redis
  docker-swarmkafka.yml     → Kafka stack (KRaft, Kafka Connect + Debezium, Kafka UI)
  Dockerfile.kafka-sync     → Docker image for the sync service
scripts/
  seed.ts          → Demo data seeder (contacts, deals, products, orders)
sqlserver-cdc.json          → Debezium connector config (6 core CRM tables)
sqlserver-cdc-junction.json → Debezium connector config (3 junction tables)
```

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your API key(s):

```env
OPENAI_API_KEY=sk-...
```

Then copy the same values into the web app runtime env file (required for Next.js API routes like `/api/chat`):

```bash
cp .env apps/web/.env.local
```

The database and Redis defaults work out of the box with the Docker Compose setup.

### 3. Start infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d postgres pgbouncer redis
```

This starts:
- **TimescaleDB** (PostgreSQL 16) on port `5432`
- **PgBouncer** (connection pooler) on port `6432`
- **Redis** on port `6379`

### 4. Push database schema

```bash
pnpm db:push
```

`db:push` now runs a prepare step that ensures the `vector` extension exists before applying schema changes.

### 5. Seed demo data

```bash
pnpm seed
```

Seeds the database with a workspace, user, 5 accounts, 20 contacts, 8 leads, a pipeline with 5 stages, 15 deals, 20 products (across 5 categories), and 15 orders with line items.

### 6. Run the web app

```bash
pnpm --filter @crm-agent/web dev
```

Open [http://localhost:3100](http://localhost:3100). You'll be redirected to `/en/dashboard` (or your browser's preferred locale).

### 7. Start the agent worker

In a separate terminal, start the BullMQ agent worker that processes session steps:

```bash
pnpm --filter @crm-agent/agent-worker dev
```

This is required for Agent Sessions to execute (follow-up sequences, reminders, nurture campaigns, etc.). The web app works without it, but sessions will remain queued and won't progress.

### 8. Start the Kafka sync service (optional — requires Kafka + Debezium)

The Kafka sync service streams CDC events from SuiteCRM (SQL Server via Debezium) into TimescaleDB, keeping contacts, accounts, orders, and products in sync automatically.

**Install Python dependencies:**

```bash
pip install -r services/kafka-sync/requirements.txt
```

**Configure the sync variables in `.env`:**

```env
KAFKA_BROKERS=<kafka-host>:48094        # External Kafka address
KAFKA_GROUP_ID=crm-sync
KAFKA_TOPIC_PATTERN=^crm\\.HCRM00365\\..*
SUITECRM_WORKSPACE_ID=<workspace-id>   # UUID or slug of the target workspace
```

**Run:**

```bash
pnpm sync:dev
```

The service will wait for topics to appear and start consuming once the Debezium connector is registered.

#### Registering the Debezium connectors

Upload the connector JSON files to the `connector-config` Docker volume via Portainer, then scale the `register-connector` service to `1`:

- `sqlserver-cdc.json` — 6 core tables: contacts, accounts, invoices, products, product-quotes, visits
- `sqlserver-cdc-junction.json` — 3 junction tables: email_addresses, email_addr_bean_rel, accounts_contacts

Register both in order. The `register-connector` service retries automatically on worker backoff and exits when done.

> **Note:** The Kafka stack (`docker-swarmkafka.yml`) runs on Docker Swarm. Deploy it via Portainer. It includes Kafka (KRaft), Kafka Connect (Debezium 2.7), and Kafka UI.

## Common Setup Pitfalls

- **`/api/chat` returns `"An error occurred."`**
  - Usually means `OPENAI_API_KEY` is missing in `apps/web/.env.local`.
  - Ensure `apps/web/.env.local` exists and contains `OPENAI_API_KEY`.

- **`error: type "vector" does not exist` during DB push/migrate**
  - Re-run `pnpm db:push` (or `pnpm db:migrate`).
  - The shared package now auto-runs `CREATE EXTENSION IF NOT EXISTS vector;` before schema operations.

### AG Grid (Orders Page)

- **Orders grid keeps default Quartz look and ignores token overrides**
  - In AG Grid v33+, pass `theme="legacy"` to `AgGridReact` when using CSS-variable theming.
  - Keep both classes on the wrapper: `ag-theme-quartz ag-theme-custom`.
  - Define custom variables/selectors with higher specificity in `apps/web/app/globals.css` using `.ag-theme-quartz.ag-theme-custom`.

- **Orders grid appears blank after enabling internal scroll**
  - Do not use `domLayout="autoHeight"` if you expect AG Grid to own vertical scrolling.
  - Ensure the card container is a column flexbox (`flex flex-col`) and the grid wrapper uses `flex-1 min-h-0`.
  - Avoid adding `overflow-y-auto` on the outer orders page wrapper when the grid should manage its own scrollbar.

## Available Scripts

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm seed` | Seed the database with demo data |
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm sync:dev` | Run the Kafka CDC sync service locally |

## Stopping Infrastructure

```bash
docker compose -f infra/docker-compose.yml down
```

Add `-v` to also remove data volumes.

---

## SuiteCRM CDC Sync

The platform ingests SuiteCRM data via Debezium → Kafka → a Python sync service that upserts into TimescaleDB.

### Topics consumed

`crm.{TENANT}.{entity}.updated` — `account`, `account-cstm`, `account-contact`, `contact`, `email-address`, `email-rel`, `product`, `product-cstm`, `product-quote`, `invoice`, `pedido` (HANPE_Pedidos), `task`, `modelo`, `modelo-product`, `stock`, `relacion` (HANA_Relaciones), `relacion-account` (hana_relaciones_accounts_c). Routing is configured in [sqlserver-cdc.json](sqlserver-cdc.json).

> **Route regex anchors:** when two CDC tables share a prefix (e.g. `hana_relaciones` vs `hana_relaciones_accounts_c`), the RegexRouter regex for the shorter name **must** end with `$` or it will also match the longer name and hijack its events into the wrong topic.

### Account type fields

The `crm_accounts` table stores two separate account-type values from different SuiteCRM source tables:

- **`source_account_type`** — from `accounts.account_type` (the base SuiteCRM table). e.g. `"Medical"`, `"Analyst"`. Populated by the `account` topic transformer.
- **`tipo_cuenta`** — from `accounts_cstm.tipocuenta_c` (the custom-fields extension table). e.g. `"Empresa"`, `"Persona Natural"`. Populated by the `account-cstm` topic transformer.

Both fields are included in the account embedding text, so semantic searches cover both type vocabularies.

> **COALESCE on cstm upserts:** the `_handle_account_cstm` handler uses `COALESCE(new_value, existing_value)` for all nullable custom columns (`nombre_comercial`, `nit_ci`, `condicion_pago`, `tipo_cuenta`, `limite_credito`, etc.) to prevent a NULL snapshot from overwriting previously-synced values.

### Account embeddings

Account embeddings use the same `vector(1536)` + pgvector pipeline as products:

- **Column** — `crm_accounts.embedding vector(1536)`
- **Index** — `IX_crm_accounts_embedding_hnsw` (HNSW, m=8, ef=32, cosine ops)
- **Embed text** — concatenation of `name`, `nombre_comercial`, `industry`, `tipo_cuenta`, `source_account_type`, `categoria_ventas`, `condicion_pago`, `zona_ventas`, `id_regional`, tags, `tipo_relacion`, `custom_fields->>'address'`, `custom_fields->>'city'`
- **Pipeline** — after each account upsert, `_enqueue_account_embedding` pushes a job to `account-embeddings:pending` (Redis list) → relay → `account-embeddings` BullMQ queue → TypeScript worker writes embedding to DB
- **Tools** — `search_accounts_similar` (free-form semantic/geographic) and `find_similar_accounts` (peer lookup by accountId)

To backfill embeddings for all existing accounts (e.g. after adding new fields to the embed text):

```bash
docker exec crm-agent-postgres psql -U platform -d platform -At -c "
SELECT 'RPUSH account-embeddings:pending ' || quote_literal(json_build_object(
  'accountId', id::text,
  'text', trim(concat_ws(' ',
    name, nombre_comercial, industry, tipo_cuenta, source_account_type,
    categoria_ventas, condicion_pago, zona_ventas, id_regional,
    array_to_string(coalesce(tags, '{}'), ' '),
    coalesce(relacion_principal->>'tipo_relacion', ''),
    coalesce(custom_fields->>'address', ''),
    coalesce(custom_fields->>'city', '')
  ))
)::text)
FROM crm_accounts
WHERE trim(coalesce(name,'')) <> ''
" | docker exec -i crm-agent-redis redis-cli --no-auth-warning
```

### Account enrichment from `hana_relaciones`

`hana_relaciones` rows are tier-0 (root) and cached in a `_sync_relacion_lookup` table keyed by `(workspace_id, external_id)` with the fields needed to enrich accounts: `zona_ventas`, `id_regional`, and a `relacion_principal` jsonb (carries `tipo_relacion`, `principal`, plus the four `_RELACION_LOOKUP_FIELDS`: `iddivision_c`, `idamercado_c`, `idcanalvta_c`, `idgrupocliente_c`).

`hana_relaciones_accounts_c` is tier-1 (junction): for each event the handler resolves the linked `crm_accounts` row by `external_id` and merges the cached relacion fields onto it (`zona_ventas`, `id_regional` via `COALESCE`, and `relacion_principal` via jsonb concat). When the relacion isn't cached yet, a DB fallback against `_sync_relacion_lookup` covers cross-batch ordering. Genuine misses are counted in the FK skip summary as `relacion-account:relacion_not_found` and `crm_accounts:fk_not_found` (the latter is expected for orphan junction rows whose underlying account was deleted in SuiteCRM).

### Dev workflow

```bash
pnpm sync:dev          # runs services/kafka-sync/main.py against the .env config
tail -f logs/kafka-sync.log
```

The service writes a rotating log to `logs/kafka-sync.log` (20 MB × 5 backups) and also streams to stderr. Override the path with `KAFKA_SYNC_LOG_FILE`.

### Stopping the sync service

The service installs `SIGINT`/`SIGTERM` handlers and the poll loop checks the shutdown flag every `timeout` seconds (default `1s`), so it shuts down cleanly on `Ctrl+C` — committing offsets, flushing the pending batch, and closing the consumer + DB.

**Caveat on Windows (Git Bash / pnpm):** when started via `pnpm sync:dev`, `Ctrl+C` is delivered to the `pnpm`/shell wrapper rather than the Python child, and the `python.exe` process keeps running in the background (you'll keep seeing upserts in `logs/kafka-sync.log`). To kill a stranded process:

```bash
# Git Bash / MSYS — note the double slashes
tasklist //FI "IMAGENAME eq python.exe"
taskkill //F //PID <pid>

# Or, kill all python processes (only safe if no other Python is running)
taskkill //F //IM python.exe
```

```powershell
# PowerShell / cmd.exe equivalents
Get-Process python | Format-Table Id, StartTime, Path
Stop-Process -Id <pid> -Force
# or
taskkill /F /IM python.exe
```

On Linux/macOS, `pkill -f services/kafka-sync/main.py` works. To avoid the wrapper issue entirely, run `python services/kafka-sync/main.py` directly in the terminal where you want `Ctrl+C` to take effect.

### Order lifecycle

Two parallel paths produce orders:

1. **Invoices** (`AOS_Invoices`) → upserted directly with the SuiteCRM status.
2. **Pedidos** (`HANPE_Pedidos`) → upserted as `draft`, then promoted by either:
   - **SAP path** — `estado_c` ∈ {`PEDIDO LIBERADO`, `ENTREGA CREADA`, `FACTURA CREADA`} → `confirmed/sap`. `Anulado` → `cancelled/sap`.
   - **Manual path** — a related `tasks` row with `status='Completed'` and `parent_type='HANPE_Pedidos'` → `confirmed/manual` (set by [`_upsert_task`](services/kafka-sync/sync_handler.py)).

Order items come from `aos_products_quotes` whose `parent_type` is one of `AOS_Invoices`, `Quotes`, `AOS_Quotes`, `HANPE_Pedidos`. Anything else (e.g. `HANE_Entregas`) is skipped at the transformer level.

### Replay & recovery

Snapshot ordering across topics is **not** guaranteed (e.g. `product-quote` events can be processed before their parent `pedido` arrives). The sync layer logs and skips silently when an FK can't be resolved.

To mitigate this, the consumer batches messages and dispatches them in **dependency-tier order** (`account/contact/product/modelo` → `*-cstm` and junctions → `pedido/invoice/modelo-product` → `product-quote/task/stock`). See `ENTITY_TIERS` in [services/kafka-sync/consumer.py](services/kafka-sync/consumer.py).

After every batch commit the handler emits a one-line **FK skip summary** at INFO when any skips occurred:

```
FK skip summary: orders:fk_not_found=12, orders:task_pedido_missing=3
```

A quick `grep "FK skip summary" logs/kafka-sync.log | tail` tells you whether the sync is still healing or has reached steady state. When counts come up short after a fresh sync, the fix is to reset offsets for the affected topic(s) and replay. Full procedure — including which order to reset, which DB rows to clear first, and the verification queries — is documented in [.github/skills/cdc-sync/SKILL.md](.github/skills/cdc-sync/SKILL.md#replay--recovery-playbook).

### AI product suggestions: data prerequisites

`POST /api/orders/suggest` returns `strategy: "centroid"` only when the subject account/contact has at least one **confirmed** order with **product-linked** items whose products have **embeddings**. If any of those are missing it falls back to `text-profile` or `popularity`. Verify with:

```sql
SELECT status, status_source, COUNT(*) FROM orders
WHERE id IN (SELECT order_id FROM suite_reco.pedidos)
GROUP BY 1,2;

SELECT COUNT(*) AS items, COUNT(product_id) AS linked FROM order_items;
SELECT COUNT(*) FROM products WHERE embedding IS NOT NULL;
```

---

## Internationalization (i18n)

The app is fully internationalized using [next-intl](https://next-intl.dev/) with URL-prefix routing.

### Supported Locales

| Locale | Language | URL prefix |
|---|---|---|
| `en` | English (default) | `/en/...` |
| `es` | Spanish | `/es/...` |

### How It Works

- **URL-prefix routing** — Each locale has its own URL prefix (e.g. `/en/dashboard`, `/es/dashboard`). The middleware detects the browser's preferred language and redirects accordingly.
- **Translation files** — All UI strings live in `apps/web/messages/en.json` and `apps/web/messages/es.json`, organized by namespace (nav, chat, dashboard, contacts, deals, products, orders, pipeline, sessions, etc.).
- **Locale-aware navigation** — Internal links use `Link`, `useRouter`, and `usePathname` from `@/i18n/navigation` to preserve the current locale across navigations.
- **AI responses** — The chat API passes the current locale to the LLM system prompt, so the assistant responds in the user's language.
- **Language switcher** — An EN/ES toggle in the sidebar footer lets users switch languages instantly.

### Adding a New Locale

1. Add the locale code to the `locales` array in `apps/web/i18n/routing.ts`
2. Create a new translation file: `apps/web/messages/{locale}.json` (copy `en.json` as a template)
3. Translate all strings in the new file

The middleware, navigation, and language switcher will pick up the new locale automatically.

---

## Using Chat

The Chat page (`/chat`) provides a conversational interface to manage your CRM. You can:

### CRM Operations

Ask the assistant to work with contacts, deals, products, orders, and pipeline stages using natural language:

- **Search contacts** — *"Find contacts at Acme Corp"*, *"Look up john@example.com"*
- **View contact details** — *"Show me details for Jane Smith"* (includes linked deals and orders)
- **Search accounts (fuzzy/keyword)** — *"buscar cuenta 10 de mayo"*, *"farmacia milennium"* — typos and partial/reordered words still find the right account thanks to a `pg_trgm` similarity fallback. The assistant confirms the chosen account before continuing when fuzzy matching was used.
- **Semantic account search** — *"farmacias rurales en Santa Cruz"*, *"cuentas mayoristas con condición contado"*, *"clientes de montero santa cruz"*, *"cuentas en la zona de sopocachi"* — uses pgvector cosine similarity over embedded account profiles (name, type, segment, address, city, industry, etc.) to find the best semantic matches.
- **Similar accounts** — *"cuentas parecidas a esta"*, *"find me 5 customers with a similar profile to this account"* — pass a known `accountId` to get the closest pgvector neighbors.
- **Top accounts by orders** — *"top accounts by revenue"*, *"cuentas con más pedidos este año"* — ranked by order count or revenue with optional date window and status filter.
- **Account 360° view** — *"Show me account [name]"* renders a rich card with contacts, deals, order stats, and recent orders in one view.
- **Order anomalies** — *"Show me stuck or overdue orders"*, *"¿Hay pedidos atrasados para esta cuenta?"* — surfaces overdue deliveries, stuck-confirmed orders, and SAP sync errors grouped by severity.
- **Create contacts** — *"Add a new contact: John Doe, john@acme.com, works at Acme"*
  - A form card appears for you to review and edit before confirming
- **Search deals** — *"Show me all open deals"*, *"Find deals worth over $50k"*
- **Create deals** — *"Create a deal: Enterprise License for $120k"*
  - Review card appears; the assistant will look up pipeline stages and contact IDs for you
- **Move deals** — *"Move the Acme deal to Negotiation stage"*
  - A confirmation card shows current → new stage before applying
- **Search products** — *"Show me all software products"*, *"Find products in the Support category"*
- **Create orders** — *"Create an order for James Rodriguez"*, *"Crear un pedido para esta cuenta"*
  - A form card appears for review before confirming
  - When called with an `accountId` or `contactId` and no pre-filled items, the form **auto-fetches AI product suggestions** from purchase history and pre-populates the line items (marked with an "AI" badge) so you can confirm or tweak before submitting
- **Order history** — *"Show me the order history for James Rodriguez"*
- **AI product suggestions** — *"What products should I recommend to this contact?"*
  - Uses RAG-based semantic search on purchase history to suggest relevant products
- **Order status** — *"What's the status of order ORD-0001?"*
- **Update order status** — *"Change this order to confirmed"*, *"Mark order ORD-0018 as shipped"*
  - A confirmation card shows current → new status before applying; follows strict transitions: `draft → confirmed → shipped → delivered` (cancel from any non-terminal)

All write operations use the **human-in-the-loop (HITL) pattern**: the AI proposes, you review a form card, then confirm or cancel. Nothing is written until you approve.

The AI responds in the user's current locale — switch to Spanish and the assistant will reply in Spanish automatically.

### Conversations

Each chat is persisted as a conversation. The sidebar shows your conversation history and you can switch between them. The `X-Conversation-Id` header links messages to the conversation in the database.

### Contextual AI Chat (Deal, Contact & Order Detail Pages)

Every deal, contact, and order detail page includes a **floating AI button** (Sparkles icon, bottom-right corner). Clicking it opens a right-side sheet with a context-aware chat:

- **Automatic context injection** — The AI already knows which deal, contact, or order you're viewing. Say *"summarize this deal"*, *"draft an email to this contact"*, or *"suggest products for this order"* without specifying names or IDs.
- **Context-specific suggestions** — The prompt chips change based on the resource type:
  - **Deals**: Summarize / Risk assessment / Draft follow-up / Move to next stage / Create nurture session
  - **Contacts**: Summarize / Show their deals / Draft email / Schedule follow-up / Nurture campaign
  - **Orders**: Summarize order / Suggest products / Check status / Update status / Follow up on order
- **Server-side context** — The client only sends `{ type, id }`. The server fetches the resource from the database and injects it into the system prompt — no sensitive data is passed from the client.
- **Fresh conversation per session** — Each time you open the sheet, a new conversation thread starts (no history pollution from the main `/chat` page).
- **Navigable detail pages** — Click any deal card (board or list view) on `/deals` to open its detail page. Click any row on `/contacts` to open the contact detail page. Click any row on `/orders` to open the order detail page. All pages show metadata, related records, and the floating AI chat button.

Works in both English and Spanish — the AI responds in the active locale.

---

## Products & Orders

The platform includes a full product catalog and order management system with AI-powered product suggestions.

### Products (`/products`)

Browse, search, and manage your product catalog:

- **List view** — Paginated table with search, showing name, SKU, category, price, stock, and active status
- **Detail page** (`/products/[id]`) — Full product info with stat cards (price, category, stock, tags), description, and status badge
- **Categories** — Products are organized into categories (Software, Services, Support, Hardware, Add-ons in the seed data)
- **Embeddings** — Product descriptions are embedded using OpenAI `text-embedding-3-small` via a BullMQ queue for async processing. Embeddings are stored as `vector(1536)` columns using pgvector and power the AI product suggestion engine.

### Orders (`/orders`)

Track and manage customer orders through their lifecycle:

- **List view** — Paginated table with search and status filter dropdown (All / Draft / Confirmed / Shipped / Delivered / Cancelled)
- **Detail page** (`/orders/[id]`) — Full order view with:
  - **Metadata cards** — Total amount (with discount/tax breakdown), item count + subtotal, linked contact, and status timeline
  - **Items table** — Product name, SKU, unit price, quantity, discount, and line total for each item
  - **Floating AI chat** — Context-aware assistant that knows the order's items, totals, and contact
- **Status lifecycle** — Orders follow a strict state machine: `draft → confirmed → shipped → delivered` (can be `cancelled` from draft or confirmed)
- **Auto-generated order numbers** — Sequential `ORD-XXXX` format

### AI Product Suggestions

The AI can recommend products for either a contact or an account based on purchase history using a hybrid RAG flow:

1. Resolves subject history from confirmed orders (contact-level or account-level aggregation)
2. Builds candidates from purchase-embedding centroid similarity when embedded purchases exist
3. Falls back to text-profile embedding when purchase embeddings are not available
4. Falls back to popularity when embedding-based retrieval is unavailable
5. Optionally reranks top candidates with an LLM (`gpt-4o-mini`) and per-product reasons

Trigger suggestions via chat (*"What products should I recommend for this contact?"*, *"What should we recommend to this account?"*) or programmatically via `POST /api/orders/suggest`.

API notes:

- Provide exactly one meaningful subject: `contactId` or `accountId`
- Nil/placeholder UUIDs (`00000000-0000-0000-0000-000000000000`) are treated as invalid context and ignored/rejected
- Already-purchased products are excluded from recommendations

### Contact Integration

Contact detail pages (`/contacts/[id]`) show a **Related Orders** section alongside the existing Related Deals section, displaying the contact's order history with order number, total, item count, status, and date.

---

---

## Tools Registry (Admin)

The platform ships with 24 hardcoded chat tools defined in [apps/web/app/api/chat/route.ts](apps/web/app/api/chat/route.ts). The **Tools Registry** lets admins extend the assistant with **HTTP-backed tools** without writing code or redeploying — and toggle existing tools on/off per workspace.

### Built-in Chat Tools

**HITL** = Human-in-the-loop: these tools render a form or confirmation card in the chat UI and write nothing until the user explicitly confirms.

| Tool | Category | Type | Description |
|---|---|---|---|
| `searchContacts` | Contacts | Read | Full-text search across name, email, and company |
| `getContact` | Contacts | Read | Fetch full contact profile including linked deals |
| `searchAccounts` | Accounts | Read | Search accounts by name, domain, industry, or SAP ID. Falls back to **trigram fuzzy matching** (pg_trgm) when ILIKE finds nothing, so typos and reordered words still match. Result includes `fuzzy: true` flag when fallback was used. |
| `search_accounts_similar` | Accounts | Read | Semantic pgvector search over account profiles by natural-language description — segments, types, payment terms, zone, region, industry, or **geographic location** (city, neighborhood, department). e.g. *"farmacias rurales en Santa Cruz"*, *"clientes de montero"*, *"cuentas en zona sopocachi"* |
| `find_similar_accounts` | Accounts | Read | Find accounts most similar to a specific known account (pgvector cosine neighbors). Pass a known `accountId`; also feeds `crossSellFromPeers` and `suggestProducts` at the account level. |
| `getTopAccountsByOrders` | Accounts | Read | Ranked account list by order count or revenue. Pass `sortBy='revenue'` for revenue ranking, `status='confirmed'` to exclude drafts/cancelled. Supports optional `city` and `zone` params for geographic scoping (e.g. "en Cochabamba" → `city: "Cochabamba"`). Only pass date window when the user explicitly requests one. |
| `getAccount` | Accounts | Read | Fetch account detail with contacts and orders |
| `searchDeals` | Deals | Read | Search deals by title or status (`open` / `won` / `lost`) |
| `listPipelineStages` | Deals | Read | List all pipeline stages with IDs — used when creating or moving deals |
| `previewCreateContact` | Contacts | HITL | Show create-contact form for review before saving |
| `previewLogActivity` | Contacts | HITL | Show log-activity form before posting |
| `previewCreateDeal` | Deals | HITL | Show create-deal form for review before saving |
| `previewUpdateDealStage` | Deals | HITL | Show stage-move confirmation before applying |
| `previewCreateSession` | Sessions | HITL | Show session plan card for review before starting |
| `getSessionStatus` | Sessions | Read | Fetch session progress and recent step events |
| `searchProducts` | Products | Read | Strict lookup by exact SKU code or category name — not for natural-language queries |
| `search_products_similar` | Products | Read | Semantic vector search for products by natural-language description |
| `getOrderHistory` | Orders | Read | Fetch order history for a contact with line items |
| `getOrderStatus` | Orders | Read | Get current status and details for a specific order |
| `suggestProducts` | Orders | Read | AI product recommendations via centroid similarity, text-profile, or popularity fallback |
| `crossSellFromPeers` | Orders | Read | Cross-sell suggestions derived from orders of similar peer accounts |
| `previewCreateOrder` | Orders | HITL | Show create-order form for review before saving. When invoked with an `accountId` (or `contactId`) and no pre-filled items, the form **auto-fetches AI product suggestions** client-side via `/api/orders/suggest` and pre-populates the line items, marked with an "AI" badge. |
| `previewUpdateOrderStatus` | Orders | HITL | Show status-change confirmation before applying (`draft → confirmed → shipped → delivered`) |
| `detectOrderAnomalies` | Orders | Read | Detect stuck/overdue/SAP-error orders for an account or contact (overdue delivery, stuck-confirmed > 7d, SAP sync error states), grouped by anomaly type with severity (warning/critical). Supports optional `city` and `zone` params for geographic scoping. |
| `analyzeRepurchaseGap` | Orders | Read | Find accounts that bought a specific product but have not reordered within N days. Useful for lapsed-customer follow-up campaigns. Supports optional `city` and `zone` params for geographic scoping. |
| `prioritizeVisits` | Accounts | Read | Composite SQL score (revenue + open deals + anomaly count + recency) to rank accounts for visit. Supports optional `city` and `zone` filters. |
| `analyzeRepurchaseProbability` | Accounts | Read | RFM scoring (Recency, Frequency, Monetary) via SQL window functions; ranks accounts by repurchase likelihood. |
| `previewRescheduleDeliveries` | Orders | HITL | Show confirmation card before bulk-rescheduling all deliveries for a given date; enqueues a BullMQ job on confirm. |

### What you can do at `/admin/tools`

- **List all registered tools** — name, kind (`static` / `http` / `query`), HITL flag, enabled state, last updated
- **Enable/disable** any tool with a single click — takes effect on the next chat request, no restart needed
- **Create new HTTP tools** — wire any external REST API (SAP, webhooks, internal services) into the chat agent via a form
- **Edit tool metadata** — description and `systemPromptHint` (the sentence that steers the LLM toward this tool) are editable for non-static tools
- **View usage analytics** — last-7-day call count, error count, and p95 latency per tool, sourced from the existing `tool_calls` table

Static tools (the 28 code-defined ones) appear in the list as read-only — they can be toggled on/off but their config lives in source code.

### Creating an HTTP tool

The "New HTTP tool" form captures everything the runtime needs:

- **Name** — exact tool name the LLM will see (e.g. `getSapInvoice`)
- **Description** — passed to the LLM as the tool's purpose
- **System-prompt hint** — appended to `CRM_INSTRUCTIONS` under a `## Custom Tools` section so the model knows when to invoke this tool
- **Input parameters** — name + type (`string` / `number` / `boolean` / `enum`) + optional flag + description, compiled into a Zod schema at request time
- **HTTP config** — URL with `{{argName}}` interpolation, method (GET/POST/PUT/DELETE), static headers (JSON), and an optional body template for POST/PUT
- **Enabled** + **HITL** toggles

### Security: SSRF allowlist

HTTP tools cannot reach arbitrary URLs. Each workspace has an **allowlist of URL prefixes** stored in `workspaces.settings.httpToolAllowlist`. Before each fetch, the executor verifies the (interpolated) target URL starts with one of the allowed prefixes — anything else is rejected with `URL not in workspace allowlist`. This prevents SSRF against internal metadata endpoints, localhost, etc.

To add a host:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{httpToolAllowlist}',
  '["https://api.example.com/"]'::jsonb
);
```

### Architecture

| Piece | Path |
|---|---|
| Schema (extended `tools` table) | [packages/shared/src/db/schema.ts](packages/shared/src/db/schema.ts) |
| Zod compiler (jsonb → `z.object`) | [apps/web/app/lib/tools/zod-from-schema.ts](apps/web/app/lib/tools/zod-from-schema.ts) |
| HTTP executor (interpolation + SSRF) | [apps/web/app/lib/tools/http-executor.ts](apps/web/app/lib/tools/http-executor.ts) |
| Dynamic loader (DB → AI SDK tools) | [apps/web/app/lib/tools/dynamic-loader.ts](apps/web/app/lib/tools/dynamic-loader.ts) |
| API: list + create | [apps/web/app/api/tools/route.ts](apps/web/app/api/tools/route.ts) |
| API: detail + update + delete | [apps/web/app/api/tools/[id]/route.ts](apps/web/app/api/tools/[id]/route.ts) |
| API: analytics | [apps/web/app/api/tools/analytics/route.ts](apps/web/app/api/tools/analytics/route.ts) |
| Admin UI | [apps/web/app/[locale]/(app)/admin/tools/](apps/web/app/[locale]/(app)/admin/tools) |

The chat route loads enabled HTTP tools per request (`loadDynamicTools`), spreads them alongside the hardcoded code-tools, and concatenates each tool's `systemPromptHint` into the system prompt. Code-tools win on name collisions.

The `tools` table stores three `kind`s: `static` (handler in code), `http` (external REST), and `query` (visual builder — column reserved, executor deferred). Soft-delete via `deletedAt`. Per-workspace scoping via `workspaceId` (null = global).

---

## Agent Worker Skills

The **agent-worker** loads its tools and system-prompt context dynamically from the [skills/](skills/) folder at the workspace root. Each subfolder is one skill:

```
skills/<name>/
  SKILL.md     # Markdown context — concatenated into the worker's system prompt
  tools.ts     # Optional — exports `createTools(workspaceId)` returning AI SDK tools
```

[packages/agent-worker/src/skill-loader.ts](packages/agent-worker/src/skill-loader.ts) walks `skills/`, reads each `SKILL.md`, and dynamically imports each `tools.ts` to register tools with the AI SDK. Folders named `custom` and `browser` are skipped.

### Adding a new skill

1. Create `skills/<name>/SKILL.md` describing the skill (becomes part of the system prompt).
2. Optionally add `skills/<name>/tools.ts`:
   ```ts
   import type { CoreTool } from "ai";
   import { z } from "zod/v3";

   export function createTools(workspaceId?: string): Record<string, CoreTool> {
     return {
       my_tool: {
         description: "...",
         inputSchema: z.object({ /* ... */ }),
         execute: async (args) => { /* ... */ },
       },
     };
   }
   ```
3. Restart the agent-worker — no other code changes needed.

Override the skills directory location with the `SKILLS_DIR` env var. The worker container ships the `skills/` folder and runs via `tsx` so dynamic `.ts` imports work in production.

> **Note:** This is distinct from the web-app **Tools Registry** (above), which exposes hardcoded + DB-defined HTTP tools to the `/api/chat` route. The skills folder powers the **worker** that processes Agent Sessions on the BullMQ queue.

---

## Agent Sessions

Agent Sessions are long-running background processes that execute multi-step plans on your behalf — follow-up sequences, reminders, nurture campaigns, and more.

### Creating a Session (via Chat)

Ask the assistant to set up a plan. Examples:

- *"Set up a 3-day follow-up sequence for the Acme deal"*
- *"Remind me to check in with Jane Smith in a week"*
- *"Create a nurture sequence: send a note now, wait 3 days, check deal status, then ask me before closing"*

The assistant will propose a plan using a **Session Plan Card** that shows:

1. The **goal** (what the session aims to accomplish)
2. An ordered list of **steps**, each with a type icon and description

Before confirming, you can:
- **Remove steps** you don't want (click the trash icon)
- **Adjust wait durations** (edit the duration field on `wait` steps, e.g. `3d`, `12h`, `1w`)

Click **Confirm & Start** to create the session and begin execution. After confirmation, the same chat card stays visible and shows a compact **live progress feed** inline as steps start, complete, wait, fail, or finish. A "View Session →" / "View full timeline →" link remains available for the full session detail page.

For the clearest validation of the live feed, create a **new** session from chat with a short `wait` step. That gives you a clean event sequence from `step_started` through `session_completed` instead of attaching late to an existing run.

### Step Types

| Type | What it does |
|---|---|
| **CRM Action** | Executes a CRM operation (create activity, log a note, update a record) and merges the result into session context |
| **Notification** | Sends you an in-app notification with the step description |
| **Wait** | Pauses execution for a duration (`30m`, `3d`, `1w`, etc.) using a delayed BullMQ job — no polling, fires exactly when the timer expires |
| **AI Reasoning** | Uses AI to analyze the accumulated session context, make decisions, and produce output for subsequent steps |
| **Human Checkpoint** | Pauses execution and notifies you for approval — the session won't continue until you approve or reject |

### Managing Sessions (`/sessions`)

The Sessions page shows all your agent sessions in a card grid:

- **Status badge** — `running`, `paused`, `waiting human`, `completed`, `failed`, `cancelled`
- **Step progress** — e.g. "Step 3/7" with a progress bar
- **Next run** — when the next step is scheduled (for sessions with active `wait` steps)
- **Quick actions** — Pause, Resume, or Cancel directly from the card

### Session Detail (`/sessions/[id]`)

Click into any session to see:

- **Header** — goal, status, action buttons (Pause / Resume / Cancel), link back to the originating chat
- **Plan stepper** (left panel) — all steps with the current one highlighted and completed ones checked
- **Vertical timeline** (right panel) — a chronological event log:
  - **Step started / completed** — when each step began and finished
  - **AI reasoning** — collapsible block showing the model's thinking
  - **CRM action result** — what was created or changed
  - **Wait scheduled** — shows duration and countdown to next run
  - **Human checkpoint** — **Approve** / **Reject** buttons appear when the session is waiting for your input
  - **Step failed** — error details in red

The detail page auto-refreshes every 5 seconds for active sessions.

### Checking Session Status (via Chat)

Ask the assistant about a running session:

- *"What's the status of the Acme follow-up session?"*
- *"Check on session [id]"*

A compact **Session Status Card** appears showing goal, status, progress, and a link to the detail page.

### Real-time Chat Progress

When a session is created from chat, the confirmation card subscribes to a server-sent events stream and renders the last few execution events inline without requiring a page refresh. The live feed can show:

- **Step started / completed** updates as each plan step runs
- **Wait scheduled** events with the configured duration
- **AI reasoning** as a collapsible block
- **Human checkpoint** when the run pauses for approval
- **Step failed** and **session completed** terminal states

The stream closes automatically when the worker emits a terminal `finish` event or when the chat card unmounts.

### Architecture Notes

- Sessions execute in the **agent-worker** on a dedicated `session-steps` BullMQ queue, separate from chat jobs
- Each step is a separate BullMQ job with **3 retry attempts** and exponential backoff
- `wait` steps use BullMQ's native **delayed jobs** — no cron or polling
- A cancelled or paused session skips any pending jobs when they fire
- The worker starts automatically alongside the existing agent-jobs worker
- The worker mirrors session lifecycle events to **Redis Streams** and the web app exposes them to the browser over **SSE** (`/api/sessions/[id]/stream`) for inline chat updates
