"""DB upsert handler — transforms CDC events and writes to TimescaleDB.

Handles FK resolution, email/account-contact junction tables, and
INSERT ... ON CONFLICT DO UPDATE upserts.
"""

import json
import logging
import os
import time
from collections import defaultdict
import psycopg2
import psycopg2.extras

try:
    import redis as _redis_lib
except ImportError:  # redis is optional; embeddings disabled if missing
    _redis_lib = None

from transformer import transform

logger = logging.getLogger(__name__)

# Max retries on transient DB errors
MAX_RETRIES = 3
RETRY_BACKOFF = [1, 3, 10]  # seconds

# Redis list consumed by the Node embedding relay in packages/agent-worker
EMBEDDING_PENDING_LIST = "product-embeddings:pending"


class SyncHandler:
    def __init__(self, dsn: str, workspace_id: str, redis_url: str | None = None):
        self.dsn = dsn
        self.workspace_id = workspace_id
        self.conn = None
        # In-memory lookup for email_addresses (id → email string)
        self._email_lookup: dict[str, str] = {}
        # Counters for FK / parent-not-found skips, flushed by consumer
        # at INFO after each batch commit. Key = (table, reason).
        self._skip_counts: dict[tuple[str, str], int] = defaultdict(int)
        # Redis for enqueuing product embedding jobs
        self.redis = None
        url = redis_url or os.getenv("REDIS_URL")
        if url and _redis_lib is not None:
            try:
                self.redis = _redis_lib.from_url(url, decode_responses=True)
                self.redis.ping()
                logger.info("Connected to Redis for embedding enqueue")
            except Exception as e:
                logger.warning("Redis unavailable, embeddings disabled: %s", e)
                self.redis = None

    def connect(self):
        self.conn = psycopg2.connect(self.dsn)
        self.conn.autocommit = False
        logger.info("Connected to database")

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    def handle(self, entity: str, payload: dict):
        """Transform and upsert a single CDC event."""
        row = transform(entity, payload, self.workspace_id)
        if row is None:
            return

        for attempt in range(MAX_RETRIES):
            try:
                self._dispatch(entity, row)
                self.conn.commit()
                return
            except psycopg2.OperationalError as e:
                self.conn.rollback()
                if attempt < MAX_RETRIES - 1:
                    wait = RETRY_BACKOFF[attempt]
                    logger.warning(
                        "Transient DB error (attempt %d/%d), retrying in %ds: %s",
                        attempt + 1, MAX_RETRIES, wait, e,
                    )
                    time.sleep(wait)
                    self._reconnect()
                else:
                    logger.error("Failed after %d retries: %s", MAX_RETRIES, e)
                    raise
            except Exception:
                self.conn.rollback()
                raise

    def _reconnect(self):
        try:
            self.close()
        except Exception:
            pass
        self.connect()

    def _dispatch(self, entity: str, row: dict):
        if row.get("__deleted"):
            self._handle_delete(entity, row)
            return

        if entity == "contact":
            self._upsert_contact(row)
        elif entity == "account":
            self._upsert_account(row)
        elif entity == "account-cstm":
            self._handle_account_cstm(row)
        elif entity == "invoice":
            self._upsert_invoice(row)
        elif entity == "product":
            self._upsert_product(row)
        elif entity == "product-cstm":
            self._handle_product_cstm(row)
        elif entity == "product-quote":
            self._upsert_order_item(row)
        elif entity == "email-address":
            self._handle_email_address(row)
        elif entity == "email-rel":
            self._handle_email_rel(row)
        elif entity == "account-contact":
            self._handle_account_contact(row)
        elif entity == "pedido":
            self._upsert_pedido(row)
        elif entity == "task":
            self._upsert_task(row)
        elif entity == "modelo":
            self._upsert_modelo(row)
        elif entity == "modelo-product":
            self._handle_modelo_product_link(row)
        elif entity == "stock":
            self._upsert_stock(row)

    # ── Delete handling ─────────────────────────────────────────

    def _handle_delete(self, entity: str, row: dict):
        """Soft-delete: we skip deletes for now (log only)."""
        logger.debug("Delete event for %s external_id=%s — skipped", entity, row.get("external_id"))

    # ── Entity upserts ──────────────────────────────────────────

    def _upsert_contact(self, row: dict):
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO contacts (
                workspace_id, external_id, external_source,
                first_name, last_name, phone, source, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(first_name)s, %(last_name)s, %(phone)s, %(source)s,
                %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                phone = EXCLUDED.phone,
                source = EXCLUDED.source,
                custom_fields = contacts.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        cur.close()

    def _upsert_account(self, row: dict):
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO crm_accounts (
                workspace_id, external_id, external_source,
                name, industry, website, size, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(name)s, %(industry)s, %(website)s, %(size)s,
                %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                name = EXCLUDED.name,
                industry = EXCLUDED.industry,
                website = EXCLUDED.website,
                size = EXCLUDED.size,
                custom_fields = crm_accounts.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        cur.close()

    def _upsert_invoice(self, row: dict):
        # Resolve FK: billing_account_id → crm_accounts.id
        account_id = self._resolve_fk(
            "crm_accounts", row.pop("_billing_account_id", None)
        )
        # Resolve FK: billing_contact_id → contacts.id
        contact_id = self._resolve_fk(
            "contacts", row.pop("_billing_contact_id", None)
        )

        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO orders (
                workspace_id, external_id, external_source,
                number, status, currency,
                subtotal, discount_amount, tax_amount, total_amount,
                contact_id, account_id, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(number)s, %(status)s, %(currency)s,
                %(subtotal)s, %(discount_amount)s, %(tax_amount)s, %(total_amount)s,
                %(contact_id)s, %(account_id)s,
                %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                number = EXCLUDED.number,
                status = EXCLUDED.status,
                subtotal = EXCLUDED.subtotal,
                discount_amount = EXCLUDED.discount_amount,
                tax_amount = EXCLUDED.tax_amount,
                total_amount = EXCLUDED.total_amount,
                contact_id = COALESCE(EXCLUDED.contact_id, orders.contact_id),
                account_id = COALESCE(EXCLUDED.account_id, orders.account_id),
                custom_fields = orders.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {
                **row,
                "contact_id": contact_id,
                "account_id": account_id,
                "custom_fields": json.dumps(row["custom_fields"]),
            },
        )
        cur.close()

    def _upsert_product(self, row: dict):
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO products (
                workspace_id, external_id, external_source,
                name, sku, description, category, price,
                type, cost, image_url,
                created_at, updated_at,
                custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(name)s, %(sku)s, %(description)s, %(category)s, %(price)s,
                %(type)s, %(cost)s, %(image_url)s,
                COALESCE(%(created_at)s::timestamptz, NOW()),
                COALESCE(%(updated_at)s::timestamptz, NOW()),
                %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                name = EXCLUDED.name,
                sku = EXCLUDED.sku,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                price = EXCLUDED.price,
                type = EXCLUDED.type,
                cost = EXCLUDED.cost,
                image_url = EXCLUDED.image_url,
                created_at = COALESCE(EXCLUDED.created_at, products.created_at),
                updated_at = COALESCE(EXCLUDED.updated_at, NOW()),
                custom_fields = products.custom_fields || EXCLUDED.custom_fields
            RETURNING id
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        result = cur.fetchone()
        cur.close()
        if result:
            self._enqueue_product_embedding(result[0], row["external_id"])

    def _handle_product_cstm(self, row: dict):
        """UPDATE-only: enrich an existing product row with cstm fields.

        If the parent product row doesn't exist yet (snapshot ordering edge
        case), silently skip — the cstm row will be re-delivered or the
        parent will overwrite on next update.
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE products SET
                brand = %(brand)s,
                min_price = %(min_price)s,
                available = %(available)s,
                reserved = %(reserved)s,
                approved = %(approved)s,
                family_id = %(family_id)s,
                family_name = %(family_name)s,
                group_id = %(group_id)s,
                group_name = %(group_name)s,
                subgroup_id = %(subgroup_id)s,
                subgroup_name = %(subgroup_name)s,
                active = COALESCE(%(active)s, active),
                unit = COALESCE(%(unit)s, unit),
                custom_fields = custom_fields || %(custom_fields)s::jsonb,
                updated_at = NOW()
            WHERE workspace_id = %(workspace_id)s
              AND external_source = %(external_source)s
              AND external_id = %(external_id)s
            RETURNING id
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        result = cur.fetchone()
        if cur.rowcount == 0:
            logger.debug(
                "product-cstm skipped — parent product %s not found (snapshot ordering)",
                row.get("external_id"),
            )
        cur.close()
        if result:
            self._enqueue_product_embedding(result[0], row["external_id"])

    def _enqueue_product_embedding(self, product_id, external_id: str):
        """Push a JSON payload to a Redis list for the Node embedding relay.

        Builds the embedding text from modelo fields when the product is
        linked to a `suite_reco.modelos` row (richer description), and
        falls back to the product/cstm fields otherwise.
        """
        if self.redis is None:
            return
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT
                p.name, p.brand, p.type, p.category,
                p.family_name, p.group_name, p.subgroup_name, p.description,
                m.nombre_comercial, m.nombre_generico, m.marca,
                m.nombre_familia, m.nombre_grupo, m.nombre_subgrupo,
                m.grupo_material1, m.grupo_material2,
                m.descripcion_basica_text, m.caracteristicas_text,
                m.codigoaio
            FROM products p
            LEFT JOIN suite_reco.product_model_links pml ON pml.product_id = p.id
            LEFT JOIN suite_reco.modelos m ON m.id = pml.modelo_id
            WHERE p.id = %s
            LIMIT 1
            """,
            (product_id,),
        )
        r = cur.fetchone()
        cur.close()
        if not r:
            return
        # Modelo fields (idx 8-18) take priority; product fields (0-7) act as fallback.
        modelo_parts = [r[i] for i in range(8, 19)]
        product_parts = [r[i] for i in range(0, 8)]
        has_modelo = any(p for p in modelo_parts)
        parts = (modelo_parts + [r[0], r[1], r[3]]) if has_modelo else product_parts
        text = " ".join(p for p in parts if p)
        if not text.strip():
            return
        try:
            self.redis.rpush(
                EMBEDDING_PENDING_LIST,
                json.dumps({"productId": str(product_id), "text": text}),
            )
        except Exception as e:
            logger.warning("Failed to enqueue embedding for %s: %s", external_id, e)

    def _upsert_order_item(self, row: dict):
        # Resolve FK: parent_id → orders.id
        parent_ext = row.pop("_parent_id", None)
        order_id = self._resolve_fk("orders", parent_ext) if parent_ext else None
        if order_id is None:
            if parent_ext:
                # _resolve_fk already counted this skip; keep per-event at DEBUG.
                logger.debug(
                    "Skipping order_item %s — parent order %s not found",
                    row.get("external_id"), parent_ext,
                )
            return

        # Resolve FK: product_id → products.id
        product_id = self._resolve_fk("products", row.pop("_product_id", None))

        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO order_items (
                order_id, external_id, external_source,
                product_id, product_name, product_sku,
                unit_price, quantity, discount_pct, line_total
            ) VALUES (
                %(order_id)s, %(external_id)s, %(external_source)s,
                %(product_id)s, %(product_name)s, %(product_sku)s,
                %(unit_price)s, %(quantity)s, %(discount_pct)s, %(line_total)s
            )
            ON CONFLICT (order_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                product_id = COALESCE(EXCLUDED.product_id, order_items.product_id),
                product_name = EXCLUDED.product_name,
                unit_price = EXCLUDED.unit_price,
                quantity = EXCLUDED.quantity,
                discount_pct = EXCLUDED.discount_pct,
                line_total = EXCLUDED.line_total
            """,
            {**row, "order_id": order_id, "product_id": product_id},
        )
        cur.close()

    # ── Junction table handlers ─────────────────────────────────

    def _handle_email_address(self, row: dict):
        """Store in in-memory lookup; also persist to DB for restart recovery."""
        ext_id = row["external_id"]
        email = row.get("email_address")
        if email:
            self._email_lookup[ext_id] = email

        # Also persist for crash recovery
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO _sync_email_lookup (external_id, email_address)
            VALUES (%s, %s)
            ON CONFLICT (external_id) DO UPDATE SET email_address = EXCLUDED.email_address
            """,
            (ext_id, email),
        )
        cur.close()

    def _handle_email_rel(self, row: dict):
        """Link email to contact when bean_module=Contacts and primary_address=true."""
        bean_module = row.get("bean_module")
        primary = row.get("primary_address")

        # Only process primary emails for contacts
        if bean_module != "Contacts" or not primary:
            return

        email_address_id = row.get("email_address_id")
        bean_id = row.get("bean_id")

        # Look up email from in-memory cache or DB
        email = self._email_lookup.get(email_address_id)
        if not email:
            cur = self.conn.cursor()
            cur.execute(
                "SELECT email_address FROM _sync_email_lookup WHERE external_id = %s",
                (email_address_id,),
            )
            result = cur.fetchone()
            cur.close()
            if result:
                email = result[0]
                self._email_lookup[email_address_id] = email

        if not email:
            logger.warning(
                "Email address %s not found for contact %s",
                email_address_id, bean_id,
            )
            return

        # Update contact's email
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE contacts SET email = %s, updated_at = NOW()
            WHERE external_id = %s AND external_source = 'suitecrm'
            """,
            (email, bean_id),
        )
        cur.close()

    def _handle_account_contact(self, row: dict):
        """Link contact to account and populate company_name."""
        contact_ext_id = row.get("contact_id")
        account_ext_id = row.get("account_id")
        if not contact_ext_id or not account_ext_id:
            return

        # Resolve account
        cur = self.conn.cursor()
        cur.execute(
            "SELECT id, name FROM crm_accounts WHERE external_id = %s AND external_source = 'suitecrm'",
            (account_ext_id,),
        )
        account = cur.fetchone()
        cur.close()

        if not account:
            logger.debug(
                "Account %s not found for contact link %s",
                account_ext_id, contact_ext_id,
            )
            return

        account_id, account_name = account

        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE contacts
            SET account_id = %s, company_name = %s, updated_at = NOW()
            WHERE external_id = %s AND external_source = 'suitecrm'
            """,
            (account_id, account_name, contact_ext_id),
        )
        cur.close()

    # ── SuiteCRM-specific handlers ──────────────────────────────

    def _handle_account_cstm(self, row: dict):
        """Update crm_accounts.sap_account_id and maintain kunnr_lookup.

        UPDATE-only — if parent account hasn't arrived yet, skip silently.
        """
        sap_id = row.get("sap_account_id")
        cur = self.conn.cursor()
        cur.execute(
            """
            UPDATE crm_accounts SET
                sap_account_id = %(sap_account_id)s,
                custom_fields = custom_fields || %(custom_fields)s::jsonb,
                updated_at = NOW()
            WHERE workspace_id = %(workspace_id)s
              AND external_source = %(external_source)s
              AND external_id = %(external_id)s
            RETURNING id
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        result = cur.fetchone()
        cur.close()
        if not result:
            logger.debug(
                "account-cstm skipped — parent account %s not found",
                row.get("external_id"),
            )
            return

        account_id = result[0]
        if sap_id:
            cur = self.conn.cursor()
            cur.execute(
                """
                INSERT INTO suite_reco.kunnr_lookup (workspace_id, kunnr, account_id, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (workspace_id, kunnr) DO UPDATE SET
                    account_id = EXCLUDED.account_id,
                    updated_at = NOW()
                """,
                (row["workspace_id"], sap_id, account_id),
            )
            cur.close()

    def _resolve_account_by_kunnr(self, kunnr: str | None) -> str | None:
        """Resolve crm_accounts.id from a SAP kunnr code.

        Joins to crm_accounts so stale kunnr_lookup rows (pointing to
        deleted accounts) are ignored — otherwise the caller would get
        back a dead UUID and hit an FK violation on insert.
        """
        if not kunnr:
            return None
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT a.id
            FROM suite_reco.kunnr_lookup k
            JOIN crm_accounts a ON a.id = k.account_id
            WHERE k.workspace_id = %s AND k.kunnr = %s
            LIMIT 1
            """,
            (self.workspace_id, kunnr),
        )
        result = cur.fetchone()
        cur.close()
        if result:
            return result[0]
        # Fallback: scan crm_accounts.sap_account_id directly (covers cases
        # where account-cstm arrived before the kunnr_lookup was seeded,
        # or where the lookup row is stale).
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT id FROM crm_accounts
            WHERE workspace_id = %s AND sap_account_id = %s
            LIMIT 1
            """,
            (self.workspace_id, kunnr),
        )
        result = cur.fetchone()
        cur.close()
        return result[0] if result else None

    def _upsert_pedido(self, row: dict):
        """Upsert hanpe_pedidos → both `orders` and `suite_reco.pedidos`."""
        kunnr = row.pop("_kunnr", None)
        kunnr_fact = row.pop("_kunnr_fact", None)
        kunnr_dest = row.pop("_kunnr_dest", None)
        estado_original = row.pop("_estado_original", None)
        nro_pedido = row.pop("_nro_pedido", None)
        nro_sap = row.pop("_nro_sap", None)
        fecha_pedido = row.pop("_fecha_pedido", None)
        fecha_entrega = row.pop("_fecha_entrega", None)
        fecha_compromiso_pago = row.pop("_fecha_compromiso_pago", None)
        payment_type = row.pop("_payment_type", None)
        cod_tipo_pedido = row.pop("_cod_tipo_pedido", None)
        tipo_doc = row.pop("_tipo_doc", None)
        canal_code = row.pop("_canal_code", None)
        sector_code = row.pop("_sector_code", None)
        mercado_code = row.pop("_mercado_code", None)
        razon_social = row.pop("_razon_social", None)
        nit = row.pop("_nit", None)
        currency_id = row.pop("_currency_id", None)
        products_quantity = row.pop("_products_quantity", None)
        contacto_sol_id = row.pop("_contacto_sol_id", None)
        estado_sync = row.pop("_estado_sync", None)

        account_id = self._resolve_account_by_kunnr(kunnr)
        # NOTE: hanpe_pedidos in this SuiteCRM tenant does not link to a
        # specific contact (orders are account-scoped via kunnr_c). We keep
        # `contacto_sol_id` in suite_reco.pedidos for audit, but leave
        # orders.contact_id NULL. The /api/orders/suggest route resolves
        # contact → account when a contactId is supplied.

        # 1) Upsert into platform `orders`
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO orders (
                workspace_id, external_id, external_source,
                number, status, currency,
                subtotal, tax_amount, total_amount,
                account_id, status_source, region_code, division_code,
                confirmed_at, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(number)s, %(status)s, %(currency)s,
                %(subtotal)s, %(tax_amount)s, %(total_amount)s,
                %(account_id)s, %(status_source)s, %(region_code)s, %(division_code)s,
                %(confirmed_at)s::timestamptz, %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
                number = EXCLUDED.number,
                -- Don't downgrade a previously-confirmed order back to draft if a
                -- later UPDATE arrives without a confirming estado.
                status = CASE
                    WHEN orders.status = 'confirmed' AND EXCLUDED.status = 'draft' THEN 'confirmed'
                    ELSE EXCLUDED.status
                END,
                status_source = COALESCE(EXCLUDED.status_source, orders.status_source),
                currency = EXCLUDED.currency,
                subtotal = EXCLUDED.subtotal,
                tax_amount = EXCLUDED.tax_amount,
                total_amount = EXCLUDED.total_amount,
                account_id = COALESCE(EXCLUDED.account_id, orders.account_id),
                region_code = EXCLUDED.region_code,
                division_code = EXCLUDED.division_code,
                confirmed_at = COALESCE(EXCLUDED.confirmed_at, orders.confirmed_at),
                custom_fields = orders.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            RETURNING id
            """,
            {
                **row,
                "account_id": account_id,
                "custom_fields": json.dumps(row["custom_fields"]),
            },
        )
        order_id = cur.fetchone()[0]
        cur.close()

        # 2) Upsert into suite_reco.pedidos with full source detail
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO suite_reco.pedidos (
                workspace_id, external_id, external_source,
                order_id, account_id,
                nro_pedido, nro_sap, kunnr, kunnr_fact, kunnr_dest,
                estado_original, status_source,
                fecha_pedido, fecha_entrega, fecha_compromiso_pago,
                payment_type, cod_tipo_pedido, tipo_doc,
                region_code, division_code, canal_code, sector_code, mercado_code,
                razon_social, nit, currency_id,
                subtotal_amount, tax_amount, total_amount, products_quantity,
                contacto_sol_id, estado_sync, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(order_id)s, %(account_id)s,
                %(nro_pedido)s, %(nro_sap)s, %(kunnr)s, %(kunnr_fact)s, %(kunnr_dest)s,
                %(estado_original)s, %(status_source)s,
                %(fecha_pedido)s::timestamptz, %(fecha_entrega)s::timestamptz, %(fecha_compromiso_pago)s::timestamptz,
                %(payment_type)s, %(cod_tipo_pedido)s, %(tipo_doc)s,
                %(region_code)s, %(division_code)s, %(canal_code)s, %(sector_code)s, %(mercado_code)s,
                %(razon_social)s, %(nit)s, %(currency_id)s,
                %(subtotal)s, %(tax_amount)s, %(total_amount)s, %(products_quantity)s,
                %(contacto_sol_id)s, %(estado_sync)s, %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id) DO UPDATE SET
                order_id = COALESCE(EXCLUDED.order_id, suite_reco.pedidos.order_id),
                account_id = COALESCE(EXCLUDED.account_id, suite_reco.pedidos.account_id),
                nro_pedido = EXCLUDED.nro_pedido,
                nro_sap = EXCLUDED.nro_sap,
                kunnr = EXCLUDED.kunnr,
                kunnr_fact = EXCLUDED.kunnr_fact,
                kunnr_dest = EXCLUDED.kunnr_dest,
                estado_original = EXCLUDED.estado_original,
                status_source = COALESCE(EXCLUDED.status_source, suite_reco.pedidos.status_source),
                fecha_pedido = EXCLUDED.fecha_pedido,
                fecha_entrega = EXCLUDED.fecha_entrega,
                fecha_compromiso_pago = EXCLUDED.fecha_compromiso_pago,
                payment_type = EXCLUDED.payment_type,
                cod_tipo_pedido = EXCLUDED.cod_tipo_pedido,
                tipo_doc = EXCLUDED.tipo_doc,
                region_code = EXCLUDED.region_code,
                division_code = EXCLUDED.division_code,
                canal_code = EXCLUDED.canal_code,
                sector_code = EXCLUDED.sector_code,
                mercado_code = EXCLUDED.mercado_code,
                razon_social = EXCLUDED.razon_social,
                nit = EXCLUDED.nit,
                currency_id = EXCLUDED.currency_id,
                subtotal_amount = EXCLUDED.subtotal_amount,
                tax_amount = EXCLUDED.tax_amount,
                total_amount = EXCLUDED.total_amount,
                products_quantity = EXCLUDED.products_quantity,
                contacto_sol_id = EXCLUDED.contacto_sol_id,
                estado_sync = EXCLUDED.estado_sync,
                custom_fields = suite_reco.pedidos.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {
                "workspace_id": row["workspace_id"],
                "external_id": row["external_id"],
                "external_source": row["external_source"],
                "order_id": order_id,
                "account_id": account_id,
                "nro_pedido": nro_pedido,
                "nro_sap": nro_sap,
                "kunnr": kunnr,
                "kunnr_fact": kunnr_fact,
                "kunnr_dest": kunnr_dest,
                "estado_original": estado_original,
                "status_source": row.get("status_source"),
                "fecha_pedido": fecha_pedido,
                "fecha_entrega": fecha_entrega,
                "fecha_compromiso_pago": fecha_compromiso_pago,
                "payment_type": payment_type,
                "cod_tipo_pedido": cod_tipo_pedido,
                "tipo_doc": tipo_doc,
                "region_code": row.get("region_code"),
                "division_code": row.get("division_code"),
                "canal_code": canal_code,
                "sector_code": sector_code,
                "mercado_code": mercado_code,
                "razon_social": razon_social,
                "nit": nit,
                "currency_id": currency_id,
                "subtotal": row.get("subtotal"),
                "tax_amount": row.get("tax_amount"),
                "total_amount": row.get("total_amount"),
                "products_quantity": products_quantity,
                "contacto_sol_id": contacto_sol_id,
                "estado_sync": estado_sync,
                "custom_fields": json.dumps(row["custom_fields"]),
            },
        )
        cur.close()

    def _upsert_task(self, row: dict):
        """Persist HANPE_Pedidos tasks; on Completed, confirm the linked pedido."""
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO suite_reco.tasks (
                workspace_id, external_id, external_source,
                name, status, bean_type, bean_id, parent_type, parent_id,
                date_start, date_due, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(name)s, %(status)s, %(bean_type)s, %(bean_id)s, %(parent_type)s, %(parent_id)s,
                %(date_start)s::timestamptz, %(date_due)s::timestamptz, %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id) DO UPDATE SET
                name = EXCLUDED.name,
                status = EXCLUDED.status,
                bean_type = EXCLUDED.bean_type,
                bean_id = EXCLUDED.bean_id,
                parent_type = EXCLUDED.parent_type,
                parent_id = EXCLUDED.parent_id,
                date_start = EXCLUDED.date_start,
                date_due = EXCLUDED.date_due,
                custom_fields = suite_reco.tasks.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        cur.close()

        # Manual-flow confirmation: if this task is Completed and points at
        # a HANPE_Pedidos bean, mark the corresponding order as confirmed
        # (only if it isn't already SAP-confirmed).
        if row.get("status") == "Completed" and row.get("bean_type") == "HANPE_Pedidos":
            bean_id = row.get("bean_id")
            if bean_id:
                cur = self.conn.cursor()
                cur.execute(
                    """
                    UPDATE orders SET
                        status = 'confirmed',
                        status_source = COALESCE(status_source, 'manual'),
                        external_task_id = %(task_id)s,
                        confirmed_at = COALESCE(confirmed_at, NOW()),
                        updated_at = NOW()
                    WHERE workspace_id = %(workspace_id)s
                      AND external_source = 'suitecrm'
                      AND external_id = %(bean_id)s
                      AND status <> 'confirmed'
                    """,
                    {
                        "workspace_id": row["workspace_id"],
                        "task_id": row["external_id"],
                        "bean_id": bean_id,
                    },
                )
                if cur.rowcount == 0:
                    self._skip_counts[("orders", "task_pedido_missing")] += 1
                    logger.debug(
                        "task %s Completed but no draft pedido %s found in orders "
                        "(already confirmed or pedido not yet synced)",
                        row.get("external_id"), bean_id,
                    )
                cur.close()
                cur = self.conn.cursor()
                cur.execute(
                    """
                    UPDATE suite_reco.pedidos SET
                        status_source = COALESCE(status_source, 'manual'),
                        external_task_id = %(task_id)s,
                        updated_at = NOW()
                    WHERE workspace_id = %(workspace_id)s
                      AND external_source = 'suitecrm'
                      AND external_id = %(bean_id)s
                    """,
                    {
                        "workspace_id": row["workspace_id"],
                        "task_id": row["external_id"],
                        "bean_id": bean_id,
                    },
                )
                cur.close()

    def _upsert_modelo(self, row: dict):
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO suite_reco.modelos (
                workspace_id, external_id, external_source,
                name, nombre_comercial, nombre_generico, marca,
                descripcion_basica_text, caracteristicas_text,
                nombre_familia, nombre_grupo, nombre_subgrupo,
                idfamilia, idgrupo, idsubgrupo,
                grupo_material1, grupo_material2, grupo_material3,
                codigoaio, codfabrica, iddivision, idamercado,
                estado, image_url, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(name)s, %(nombre_comercial)s, %(nombre_generico)s, %(marca)s,
                %(descripcion_basica_text)s, %(caracteristicas_text)s,
                %(nombre_familia)s, %(nombre_grupo)s, %(nombre_subgrupo)s,
                %(idfamilia)s, %(idgrupo)s, %(idsubgrupo)s,
                %(grupo_material1)s, %(grupo_material2)s, %(grupo_material3)s,
                %(codigoaio)s, %(codfabrica)s, %(iddivision)s, %(idamercado)s,
                %(estado)s, %(image_url)s, %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id) DO UPDATE SET
                name = EXCLUDED.name,
                nombre_comercial = EXCLUDED.nombre_comercial,
                nombre_generico = EXCLUDED.nombre_generico,
                marca = EXCLUDED.marca,
                descripcion_basica_text = EXCLUDED.descripcion_basica_text,
                caracteristicas_text = EXCLUDED.caracteristicas_text,
                nombre_familia = EXCLUDED.nombre_familia,
                nombre_grupo = EXCLUDED.nombre_grupo,
                nombre_subgrupo = EXCLUDED.nombre_subgrupo,
                idfamilia = EXCLUDED.idfamilia,
                idgrupo = EXCLUDED.idgrupo,
                idsubgrupo = EXCLUDED.idsubgrupo,
                grupo_material1 = EXCLUDED.grupo_material1,
                grupo_material2 = EXCLUDED.grupo_material2,
                grupo_material3 = EXCLUDED.grupo_material3,
                codigoaio = EXCLUDED.codigoaio,
                codfabrica = EXCLUDED.codfabrica,
                iddivision = EXCLUDED.iddivision,
                idamercado = EXCLUDED.idamercado,
                estado = EXCLUDED.estado,
                image_url = EXCLUDED.image_url,
                custom_fields = suite_reco.modelos.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            RETURNING id
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        result = cur.fetchone()
        cur.close()

        # Re-enqueue embeddings for all products linked to this modelo so the
        # richer text reflects in the vector.
        if result and self.redis is not None:
            modelo_id = result[0]
            cur = self.conn.cursor()
            cur.execute(
                """
                SELECT product_id FROM suite_reco.product_model_links
                WHERE modelo_id = %s
                """,
                (modelo_id,),
            )
            rows = cur.fetchall()
            cur.close()
            for (pid,) in rows:
                self._enqueue_product_embedding(pid, str(pid))

    def _handle_modelo_product_link(self, row: dict):
        """Resolve modelo + product UUIDs, upsert junction, refresh embedding."""
        modelo_ext = row.get("modelo_external_id")
        product_ext = row.get("product_external_id")
        modelo_id = self._resolve_fk("suite_reco.modelos", modelo_ext)
        product_id = self._resolve_fk("products", product_ext)
        if modelo_id is None or product_id is None:
            logger.debug(
                "modelo-product link skipped — modelo=%s product=%s not found",
                modelo_ext, product_ext,
            )
            return

        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO suite_reco.product_model_links (
                external_id, workspace_id, modelo_id, product_id,
                modelo_external_id, product_external_id, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (external_id) DO UPDATE SET
                modelo_id = EXCLUDED.modelo_id,
                product_id = EXCLUDED.product_id,
                modelo_external_id = EXCLUDED.modelo_external_id,
                product_external_id = EXCLUDED.product_external_id,
                updated_at = NOW()
            """,
            (
                row["external_id"], row["workspace_id"], modelo_id, product_id,
                modelo_ext, product_ext,
            ),
        )
        cur.close()

        # Trigger an embedding refresh so the product picks up modelo text.
        self._enqueue_product_embedding(product_id, product_ext)

    def _upsert_stock(self, row: dict):
        """Persist hanq_stock unit-level row.

        Note: the hanq_stock → aos_products link is handled by a separate
        SuiteCRM junction table that we do not currently sync. The stock
        row is preserved without a product link until that junction is
        added — at which point `products.stock_qty` should be recomputed.
        """
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO suite_reco.stock_units (
                workspace_id, external_id, external_source,
                name, chasis, motor, lote, almacen, ubicacion, nombre_color,
                stock, estado_cotizacion, date_due, custom_fields
            ) VALUES (
                %(workspace_id)s, %(external_id)s, %(external_source)s,
                %(name)s, %(chasis)s, %(motor)s, %(lote)s, %(almacen)s, %(ubicacion)s, %(nombre_color)s,
                %(stock)s, %(estado_cotizacion)s, %(date_due)s::timestamptz, %(custom_fields)s::jsonb
            )
            ON CONFLICT (workspace_id, external_source, external_id) DO UPDATE SET
                name = EXCLUDED.name,
                chasis = EXCLUDED.chasis,
                motor = EXCLUDED.motor,
                lote = EXCLUDED.lote,
                almacen = EXCLUDED.almacen,
                ubicacion = EXCLUDED.ubicacion,
                nombre_color = EXCLUDED.nombre_color,
                stock = EXCLUDED.stock,
                estado_cotizacion = EXCLUDED.estado_cotizacion,
                date_due = EXCLUDED.date_due,
                custom_fields = suite_reco.stock_units.custom_fields || EXCLUDED.custom_fields,
                updated_at = NOW()
            """,
            {**row, "custom_fields": json.dumps(row["custom_fields"])},
        )
        cur.close()

    # ── FK resolution helper ────────────────────────────────────

    def _resolve_fk(self, table: str, external_id: str | None) -> str | None:
        """Look up internal UUID by external_id in the given table.

        When an external_id is supplied but no row matches, increments the
        skip counter for the table so the consumer can emit a periodic
        INFO summary ("FK skip summary: ...") instead of per-event spam.
        """
        if not external_id:
            return None
        cur = self.conn.cursor()
        cur.execute(
            f"SELECT id FROM {table} WHERE external_id = %s AND external_source = 'suitecrm' LIMIT 1",
            (external_id,),
        )
        result = cur.fetchone()
        cur.close()
        if result:
            return result[0]
        self._skip_counts[(table, "fk_not_found")] += 1
        return None

    def flush_stats(self):
        """Emit accumulated skip counters at INFO and reset.

        Called by the consumer after each batch commit. Silent when no
        skips have occurred.
        """
        if not self._skip_counts:
            return
        summary = ", ".join(
            f"{table}:{reason}={n}"
            for (table, reason), n in sorted(self._skip_counts.items())
        )
        logger.info("FK skip summary: %s", summary)
        self._skip_counts.clear()

    # ── Schema bootstrap ────────────────────────────────────────

    def ensure_lookup_table(self):
        """Create the email lookup table if it doesn't exist."""
        cur = self.conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS _sync_email_lookup (
                external_id VARCHAR(36) PRIMARY KEY,
                email_address VARCHAR(320)
            )
            """
        )
        self.conn.commit()
        cur.close()
        logger.info("Email lookup table ready")
