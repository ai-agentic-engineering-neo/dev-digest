ALTER TABLE "agent_runs" ADD COLUMN "repo_intel_degraded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "findings_review_id_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_id_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_id_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_id_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "multi_agent_runs_workspace_id_idx" ON "multi_agent_runs" USING btree ("workspace_id");