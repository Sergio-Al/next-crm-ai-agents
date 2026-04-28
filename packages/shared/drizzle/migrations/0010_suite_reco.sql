-- ════════════════════════════════════════════════════════════════════════
-- Migration: SuiteCRM recommendation schema (`suite_reco`) + bridge cols
-- Idempotent: safe to re-run. Apply via:
--   docker exec -i crm-agent-postgres psql -U platform -d platform < 0010_suite_reco.sql
-- ════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS suite_reco;

-- ── Platform table additions ──────────────────────────────────────────
ALTER TABLE crm_accounts
  ADD COLUMN IF NOT EXISTS sap_account_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS "IX_crm_accounts_sap"
  ON crm_accounts (workspace_id, sap_account_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS external_task_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS status_source     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS region_code       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS division_code     VARCHAR(50);

-- ── kunnr → account_id lookup ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.kunnr_lookup (
  workspace_id  UUID         NOT NULL,
  kunnr         VARCHAR(50)  NOT NULL,
  account_id    UUID         NOT NULL,
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (workspace_id, kunnr)
);

CREATE INDEX IF NOT EXISTS "IX_kunnr_lookup_account"
  ON suite_reco.kunnr_lookup (account_id);

-- ── Modelos (master product definitions) ──────────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.modelos (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID         NOT NULL,
  external_id                 VARCHAR(36)  NOT NULL,
  external_source             VARCHAR(50)  NOT NULL DEFAULT 'suitecrm',
  name                        VARCHAR(300),
  nombre_comercial            VARCHAR(300),
  nombre_generico             VARCHAR(300),
  marca                       VARCHAR(200),
  descripcion_basica_text     TEXT,
  caracteristicas_text        TEXT,
  nombre_familia              VARCHAR(255),
  nombre_grupo                VARCHAR(255),
  nombre_subgrupo             VARCHAR(255),
  idfamilia                   VARCHAR(100),
  idgrupo                     VARCHAR(100),
  idsubgrupo                  VARCHAR(100),
  grupo_material1             VARCHAR(100),
  grupo_material2             VARCHAR(100),
  grupo_material3             VARCHAR(100),
  codigoaio                   VARCHAR(100),
  codfabrica                  VARCHAR(100),
  iddivision                  VARCHAR(100),
  idamercado                  VARCHAR(100),
  estado                      VARCHAR(100),
  image_url                   TEXT,
  custom_fields               JSONB        DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_modelos_external"
  ON suite_reco.modelos (workspace_id, external_source, external_id);
CREATE INDEX IF NOT EXISTS "IX_modelos_marca"
  ON suite_reco.modelos (workspace_id, marca);
CREATE INDEX IF NOT EXISTS "IX_modelos_familia"
  ON suite_reco.modelos (workspace_id, idfamilia);
CREATE INDEX IF NOT EXISTS "IX_modelos_grupo"
  ON suite_reco.modelos (workspace_id, idgrupo);

-- ── modelo ↔ aos_products junction ────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.product_model_links (
  external_id          VARCHAR(36) PRIMARY KEY,
  workspace_id         UUID NOT NULL,
  modelo_id            UUID NOT NULL REFERENCES suite_reco.modelos(id) ON DELETE CASCADE,
  product_id           UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modelo_external_id   VARCHAR(36) NOT NULL,
  product_external_id  VARCHAR(36) NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_pml_modelo"  ON suite_reco.product_model_links (modelo_id);
CREATE INDEX IF NOT EXISTS "IX_pml_product" ON suite_reco.product_model_links (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_pml_pair"
  ON suite_reco.product_model_links (workspace_id, modelo_external_id, product_external_id);

-- ── hanq_stock unit-level inventory ───────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.stock_units (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,
  external_id          VARCHAR(36) NOT NULL,
  external_source      VARCHAR(50) NOT NULL DEFAULT 'suitecrm',
  product_id           UUID REFERENCES products(id) ON DELETE SET NULL,
  product_external_id  VARCHAR(36),
  name                 VARCHAR(255),
  chasis               VARCHAR(255),
  motor                VARCHAR(255),
  lote                 VARCHAR(255),
  almacen              VARCHAR(255),
  ubicacion            VARCHAR(255),
  nombre_color         VARCHAR(255),
  stock                INTEGER,
  estado_cotizacion    VARCHAR(100),
  date_due             TIMESTAMPTZ,
  custom_fields        JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_stock_units_external"
  ON suite_reco.stock_units (workspace_id, external_source, external_id);
CREATE INDEX IF NOT EXISTS "IX_stock_units_product"
  ON suite_reco.stock_units (product_id);
CREATE INDEX IF NOT EXISTS "IX_stock_units_estado"
  ON suite_reco.stock_units (workspace_id, estado_cotizacion);

-- ── hanpe_pedidos source detail ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.pedidos (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,
  external_id              VARCHAR(36) NOT NULL,
  external_source          VARCHAR(50) NOT NULL DEFAULT 'suitecrm',
  order_id                 UUID REFERENCES orders(id) ON DELETE SET NULL,
  account_id               UUID REFERENCES crm_accounts(id) ON DELETE SET NULL,
  nro_pedido               VARCHAR(100),
  nro_sap                  VARCHAR(100),
  kunnr                    VARCHAR(50),
  kunnr_fact               VARCHAR(50),
  kunnr_dest               VARCHAR(50),
  estado_original          VARCHAR(255),
  status_source            VARCHAR(20),
  external_task_id         VARCHAR(36),
  fecha_pedido             TIMESTAMPTZ,
  fecha_entrega            TIMESTAMPTZ,
  fecha_compromiso_pago    TIMESTAMPTZ,
  payment_type             VARCHAR(100),
  cod_tipo_pedido          INTEGER,
  tipo_doc                 VARCHAR(100),
  region_code              VARCHAR(50),
  division_code            VARCHAR(50),
  canal_code               VARCHAR(50),
  sector_code              VARCHAR(50),
  mercado_code             VARCHAR(50),
  razon_social             VARCHAR(255),
  nit                      VARCHAR(100),
  currency_id              VARCHAR(36),
  subtotal_amount          NUMERIC(18, 4),
  tax_amount               NUMERIC(18, 4),
  total_amount             NUMERIC(18, 4),
  products_quantity        INTEGER,
  contacto_sol_id          VARCHAR(36),
  estado_sync              VARCHAR(100),
  custom_fields            JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_pedidos_external"
  ON suite_reco.pedidos (workspace_id, external_source, external_id);
CREATE INDEX IF NOT EXISTS "IX_pedidos_order"   ON suite_reco.pedidos (order_id);
CREATE INDEX IF NOT EXISTS "IX_pedidos_account" ON suite_reco.pedidos (account_id);
CREATE INDEX IF NOT EXISTS "IX_pedidos_kunnr"   ON suite_reco.pedidos (workspace_id, kunnr);
CREATE INDEX IF NOT EXISTS "IX_pedidos_estado"  ON suite_reco.pedidos (workspace_id, estado_original);

-- ── tasks (HANPE_Pedidos completion driver) ───────────────────────────
CREATE TABLE IF NOT EXISTS suite_reco.tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  external_id       VARCHAR(36) NOT NULL,
  external_source   VARCHAR(50) NOT NULL DEFAULT 'suitecrm',
  name              VARCHAR(255),
  status            VARCHAR(100),
  bean_type         VARCHAR(100),
  bean_id           VARCHAR(36),
  parent_type       VARCHAR(100),
  parent_id         VARCHAR(36),
  date_start        TIMESTAMPTZ,
  date_due          TIMESTAMPTZ,
  custom_fields     JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_tasks_external"
  ON suite_reco.tasks (workspace_id, external_source, external_id);
CREATE INDEX IF NOT EXISTS "IX_tasks_bean"
  ON suite_reco.tasks (workspace_id, bean_type, bean_id);
