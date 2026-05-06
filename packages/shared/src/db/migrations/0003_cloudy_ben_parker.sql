ALTER TABLE "crm_accounts" ADD COLUMN "nombre_comercial" varchar(300);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "nit_ci" varchar(50);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "categoria_ventas" varchar(5);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "condicion_pago" varchar(20);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "tipo_cuenta" varchar(50);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "limite_credito" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "bloqueo_entrega" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "bloqueo_factura" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "relacion_principal" jsonb DEFAULT '{}'::jsonb;