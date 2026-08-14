ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "index_sha" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "index_status" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "indexer_version" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "intent_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "dropped_inputs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "pr_brief_head_sha_idx" ON "pr_brief" USING btree ("head_sha");