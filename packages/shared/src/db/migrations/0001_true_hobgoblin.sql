CREATE SCHEMA "suite_reco";
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"conversation_id" uuid,
	"goal" text NOT NULL,
	"plan" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'running' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" varchar(300) NOT NULL,
	"product_sku" varchar(100),
	"unit_price" numeric(15, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0',
	"line_total" numeric(15, 2) NOT NULL,
	"notes" text,
	"external_id" varchar(36),
	"external_source" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"number" varchar(50) NOT NULL,
	"contact_id" uuid,
	"account_id" uuid,
	"deal_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"subtotal" numeric(15, 2) DEFAULT '0',
	"discount_amount" numeric(15, 2) DEFAULT '0',
	"tax_amount" numeric(15, 2) DEFAULT '0',
	"total_amount" numeric(15, 2) DEFAULT '0',
	"notes" text,
	"assigned_to" uuid,
	"confirmed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"external_task_id" varchar(36),
	"status_source" varchar(20),
	"region_code" varchar(50),
	"division_code" varchar(50),
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"external_id" varchar(36),
	"external_source" varchar(50),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"sku" varchar(100),
	"description" text,
	"category" varchar(200),
	"price" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"unit" varchar(50) DEFAULT 'piece',
	"stock_qty" integer,
	"active" boolean DEFAULT true,
	"type" varchar(50),
	"cost" numeric(15, 2),
	"image_url" text,
	"brand" varchar(200),
	"min_price" numeric(15, 2),
	"available" numeric(15, 3),
	"reserved" integer,
	"approved" boolean,
	"family_id" varchar(50),
	"family_name" varchar(200),
	"group_id" varchar(50),
	"group_name" varchar(200),
	"subgroup_id" varchar(50),
	"subgroup_name" varchar(200),
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"tags" text[] DEFAULT '{}',
	"embedding" vector(1536),
	"external_id" varchar(36),
	"external_source" varchar(50),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_index" integer,
	"type" varchar(50) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."kunnr_lookup" (
	"workspace_id" uuid NOT NULL,
	"kunnr" varchar(50) NOT NULL,
	"account_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "kunnr_lookup_workspace_id_kunnr_pk" PRIMARY KEY("workspace_id","kunnr")
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" varchar(36) NOT NULL,
	"external_source" varchar(50) DEFAULT 'suitecrm' NOT NULL,
	"name" varchar(300),
	"nombre_comercial" varchar(300),
	"nombre_generico" varchar(300),
	"marca" varchar(200),
	"descripcion_basica_text" text,
	"caracteristicas_text" text,
	"nombre_familia" varchar(255),
	"nombre_grupo" varchar(255),
	"nombre_subgrupo" varchar(255),
	"idfamilia" varchar(100),
	"idgrupo" varchar(100),
	"idsubgrupo" varchar(100),
	"grupo_material1" varchar(100),
	"grupo_material2" varchar(100),
	"grupo_material3" varchar(100),
	"codigoaio" varchar(100),
	"codfabrica" varchar(100),
	"iddivision" varchar(100),
	"idamercado" varchar(100),
	"estado" varchar(100),
	"image_url" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" varchar(36) NOT NULL,
	"external_source" varchar(50) DEFAULT 'suitecrm' NOT NULL,
	"order_id" uuid,
	"account_id" uuid,
	"nro_pedido" varchar(100),
	"nro_sap" varchar(100),
	"kunnr" varchar(50),
	"kunnr_fact" varchar(50),
	"kunnr_dest" varchar(50),
	"estado_original" varchar(255),
	"status_source" varchar(20),
	"external_task_id" varchar(36),
	"fecha_pedido" timestamp with time zone,
	"fecha_entrega" timestamp with time zone,
	"fecha_compromiso_pago" timestamp with time zone,
	"payment_type" varchar(100),
	"cod_tipo_pedido" integer,
	"tipo_doc" varchar(100),
	"region_code" varchar(50),
	"division_code" varchar(50),
	"canal_code" varchar(50),
	"sector_code" varchar(50),
	"mercado_code" varchar(50),
	"razon_social" varchar(255),
	"nit" varchar(100),
	"currency_id" varchar(36),
	"subtotal_amount" numeric(18, 4),
	"tax_amount" numeric(18, 4),
	"total_amount" numeric(18, 4),
	"products_quantity" integer,
	"contacto_sol_id" varchar(36),
	"estado_sync" varchar(100),
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."product_model_links" (
	"external_id" varchar(36) PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"modelo_external_id" varchar(36) NOT NULL,
	"product_external_id" varchar(36) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."stock_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" varchar(36) NOT NULL,
	"external_source" varchar(50) DEFAULT 'suitecrm' NOT NULL,
	"product_id" uuid,
	"product_external_id" varchar(36),
	"name" varchar(255),
	"chasis" varchar(255),
	"motor" varchar(255),
	"lote" varchar(255),
	"almacen" varchar(255),
	"ubicacion" varchar(255),
	"nombre_color" varchar(255),
	"stock" integer,
	"estado_cotizacion" varchar(100),
	"date_due" timestamp with time zone,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suite_reco"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" varchar(36) NOT NULL,
	"external_source" varchar(50) DEFAULT 'suitecrm' NOT NULL,
	"name" varchar(255),
	"status" varchar(100),
	"bean_type" varchar(100),
	"bean_id" varchar(36),
	"parent_type" varchar(100),
	"parent_id" varchar(36),
	"date_start" timestamp with time zone,
	"date_due" timestamp with time zone,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "external_id" varchar(36);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "external_source" varchar(50);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "title" varchar(500);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "sap_account_id" varchar(50);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "external_id" varchar(36);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "external_source" varchar(50);--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_reco"."pedidos" ADD CONSTRAINT "pedidos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_reco"."pedidos" ADD CONSTRAINT "pedidos_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_reco"."product_model_links" ADD CONSTRAINT "product_model_links_modelo_id_modelos_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "suite_reco"."modelos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_reco"."product_model_links" ADD CONSTRAINT "product_model_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_reco"."stock_units" ADD CONSTRAINT "stock_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IX_agent_sessions_workspace" ON "agent_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "IX_agent_sessions_status" ON "agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IX_agent_sessions_conversation" ON "agent_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "IX_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "IX_order_items_product" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_order_items_external" ON "order_items" USING btree ("order_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_orders_number" ON "orders" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "IX_orders_workspace_status" ON "orders" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "IX_orders_contact" ON "orders" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "IX_orders_account" ON "orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "IX_orders_deal" ON "orders" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_orders_external" ON "orders" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_products_workspace" ON "products" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "IX_products_sku" ON "products" USING btree ("workspace_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_products_external" ON "products" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_products_type" ON "products" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "IX_products_brand" ON "products" USING btree ("workspace_id","brand");--> statement-breakpoint
CREATE INDEX "IX_products_family" ON "products" USING btree ("workspace_id","family_id");--> statement-breakpoint
CREATE INDEX "IX_products_group" ON "products" USING btree ("workspace_id","group_id");--> statement-breakpoint
CREATE INDEX "IX_session_events_session" ON "session_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "IX_kunnr_lookup_account" ON "suite_reco"."kunnr_lookup" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_modelos_external" ON "suite_reco"."modelos" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_modelos_marca" ON "suite_reco"."modelos" USING btree ("workspace_id","marca");--> statement-breakpoint
CREATE INDEX "IX_modelos_familia" ON "suite_reco"."modelos" USING btree ("workspace_id","idfamilia");--> statement-breakpoint
CREATE INDEX "IX_modelos_grupo" ON "suite_reco"."modelos" USING btree ("workspace_id","idgrupo");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_pedidos_external" ON "suite_reco"."pedidos" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_pedidos_order" ON "suite_reco"."pedidos" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "IX_pedidos_account" ON "suite_reco"."pedidos" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "IX_pedidos_kunnr" ON "suite_reco"."pedidos" USING btree ("workspace_id","kunnr");--> statement-breakpoint
CREATE INDEX "IX_pedidos_estado" ON "suite_reco"."pedidos" USING btree ("workspace_id","estado_original");--> statement-breakpoint
CREATE INDEX "IX_pml_modelo" ON "suite_reco"."product_model_links" USING btree ("modelo_id");--> statement-breakpoint
CREATE INDEX "IX_pml_product" ON "suite_reco"."product_model_links" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_pml_pair" ON "suite_reco"."product_model_links" USING btree ("workspace_id","modelo_external_id","product_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_stock_units_external" ON "suite_reco"."stock_units" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_stock_units_product" ON "suite_reco"."stock_units" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "IX_stock_units_estado" ON "suite_reco"."stock_units" USING btree ("workspace_id","estado_cotizacion");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_tasks_external" ON "suite_reco"."tasks" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_tasks_bean" ON "suite_reco"."tasks" USING btree ("workspace_id","bean_type","bean_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_contacts_external" ON "contacts" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IX_crm_accounts_external" ON "crm_accounts" USING btree ("workspace_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "IX_crm_accounts_sap" ON "crm_accounts" USING btree ("workspace_id","sap_account_id");