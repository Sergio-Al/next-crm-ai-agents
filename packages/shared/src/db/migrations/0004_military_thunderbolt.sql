ALTER TABLE "crm_accounts" ADD COLUMN "zona_ventas" varchar(20);--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "id_regional" varchar(20);--> statement-breakpoint
CREATE INDEX "IX_crm_accounts_zona" ON "crm_accounts" USING btree ("workspace_id","zona_ventas");--> statement-breakpoint
CREATE INDEX "IX_crm_accounts_regional" ON "crm_accounts" USING btree ("workspace_id","id_regional");