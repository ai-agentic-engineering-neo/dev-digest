ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "source_review_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "files_total" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "files_included" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "kind" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_runs_pr_kind_ran_at_idx" ON "agent_runs" USING btree ("pr_id","kind","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_one_running_brief_uidx" ON "agent_runs" USING btree ("pr_id") WHERE "agent_runs"."kind" = 'brief' and "agent_runs"."status" = 'running';