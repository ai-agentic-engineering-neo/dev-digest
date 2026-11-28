-- Clean up rows the new constraints would reject, before adding them.
-- Runs detached from any PR are unreachable (every reader filters by PR).
DELETE FROM "agent_runs" WHERE "pr_id" IS NULL;
--> statement-breakpoint
UPDATE "reviews" SET "agent_id" = NULL
WHERE "agent_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "agents" WHERE "agents"."id" = "reviews"."agent_id");
--> statement-breakpoint
DELETE FROM "reviews"
WHERE "run_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "agent_runs" WHERE "agent_runs"."id" = "reviews"."run_id");
--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_pr_id_pull_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;