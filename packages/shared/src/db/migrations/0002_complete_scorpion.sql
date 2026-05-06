ALTER TABLE "tools" ADD COLUMN "kind" varchar(20) DEFAULT 'static' NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "system_prompt_hint" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "hitl" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "input_schema" jsonb;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;