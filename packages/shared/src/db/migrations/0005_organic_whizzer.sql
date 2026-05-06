CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "source_account_type" varchar(50);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IX_crm_accounts_embedding_hnsw"
	ON "crm_accounts" USING hnsw ("embedding" vector_cosine_ops)
	WITH (m = 8, ef_construction = 32);--> statement-breakpoint
ALTER TABLE "suite_reco"."pedidos" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "suite_reco"."pedidos" ADD COLUMN IF NOT EXISTS "lng" double precision;--> statement-breakpoint
ALTER TABLE "suite_reco"."pedidos" ADD COLUMN IF NOT EXISTS "description" text;
