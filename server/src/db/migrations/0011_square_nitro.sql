CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
DROP INDEX "repos_ws_idx";--> statement-breakpoint
DROP INDEX "symbols_repo_path_idx";--> statement-breakpoint
CREATE INDEX "pr_commits_pr_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_pr_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_created_idx" ON "reviews" USING btree ("pr_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_pr_ran_idx" ON "agent_runs" USING btree ("pr_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_running_idx" ON "agent_runs" USING btree ("status") WHERE "agent_runs"."status" = 'running';