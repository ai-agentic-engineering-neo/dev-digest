-- Hand-added data cleanup (runs BEFORE the new constraints; no-ops on clean data).
-- Duplicates would block the new UNIQUE constraints: keep one row per key.
DELETE FROM "settings" a USING "settings" b WHERE a."workspace_id" = b."workspace_id" AND a."user_id" IS NOT DISTINCT FROM b."user_id" AND a."key" = b."key" AND a.ctid < b.ctid;--> statement-breakpoint
DELETE FROM "symbols" a USING "symbols" b WHERE a."repo_id" = b."repo_id" AND a."path" = b."path" AND a."name" = b."name" AND a."kind" = b."kind" AND a."line" IS NOT DISTINCT FROM b."line" AND a.ctid < b.ctid;--> statement-breakpoint
DELETE FROM "pr_files" a USING "pr_files" b WHERE a."pr_id" = b."pr_id" AND a."path" = b."path" AND a.ctid < b.ctid;--> statement-breakpoint
DELETE FROM "pr_commits" a USING "pr_commits" b WHERE a."pr_id" = b."pr_id" AND a."sha" = b."sha" AND a.ctid < b.ctid;--> statement-breakpoint
-- Dangling references would block the new FKs: detach them (keep the reviews).
UPDATE "reviews" r SET "agent_id" = NULL WHERE r."agent_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "agents" a WHERE a."id" = r."agent_id");--> statement-breakpoint
UPDATE "reviews" r SET "run_id" = NULL WHERE r."run_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "agent_runs" ar WHERE ar."id" = r."run_id");--> statement-breakpoint
DROP INDEX "settings_ws_user_key_uq";--> statement-breakpoint
DROP INDEX "symbols_repo_path_name_kind_line_uq";--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(12, 6);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_created_idx" ON "reviews" USING btree ("pr_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_run_idx" ON "reviews" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "reviews_agent_idx" ON "reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_skills_skill_idx" ON "agent_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agents_ws_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "memory_repo_idx" ON "memory" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "memory_embedding_hnsw_idx" ON "memory" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "code_chunks_embedding_hnsw_idx" ON "code_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_ran_idx" ON "agent_runs" USING btree ("pr_id","ran_at");--> statement-breakpoint
CREATE INDEX "agent_runs_running_idx" ON "agent_runs" USING btree ("pr_id") WHERE "agent_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_ws_idx" ON "jobs" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_ws_user_key_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","user_id","key");--> statement-breakpoint
ALTER TABLE "pr_commits" ADD CONSTRAINT "pr_commits_pr_sha_uq" UNIQUE("pr_id","sha");--> statement-breakpoint
ALTER TABLE "pr_files" ADD CONSTRAINT "pr_files_pr_path_uq" UNIQUE("pr_id","path");--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_repo_path_name_kind_line_uq" UNIQUE NULLS NOT DISTINCT("repo_id","path","name","kind","line");--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_chk" CHECK ("workspace_members"."role" IN ('owner', 'member'));--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_status_chk" CHECK ("pull_requests"."status" IN ('needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_severity_chk" CHECK ("findings"."severity" IN ('CRITICAL', 'WARNING', 'SUGGESTION'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_chk" CHECK ("findings"."category" IN ('bug', 'security', 'perf', 'style', 'test'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_kind_chk" CHECK ("findings"."kind" IN ('finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook'));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_kind_chk" CHECK ("reviews"."kind" IN ('summary', 'review'));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_type_chk" CHECK ("skills"."type" IN ('rubric', 'convention', 'security', 'custom'));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_chk" CHECK ("skills"."source" IN ('manual', 'imported_url', 'extracted', 'community'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_provider_chk" CHECK ("agents"."provider" IN ('openai', 'anthropic', 'openrouter'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_strategy_chk" CHECK ("agents"."strategy" IN ('single-pass', 'map-reduce', 'auto'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_ci_fail_on_chk" CHECK ("agents"."ci_fail_on" IN ('never', 'critical', 'warning', 'any'));--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_scope_chk" CHECK ("memory"."scope" IN ('repo', 'global', 'team'));--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_kind_chk" CHECK ("memory"."kind" IN ('decision', 'convention', 'preference', 'fact', 'learning'));--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_source_chk" CHECK ("code_chunks"."source" IN ('code', 'docs', 'spec'));--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_owner_kind_chk" CHECK ("eval_cases"."owner_kind" IN ('skill', 'agent'));--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_target_type_chk" CHECK ("ci_installations"."target_type" IN ('gha', 'circle', 'jenkins', 'cli'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_chk" CHECK ("agent_runs"."status" IN ('running', 'done', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_source_chk" CHECK ("agent_runs"."source" IN ('local', 'ci'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_chk" CHECK ("jobs"."status" IN ('queued', 'running', 'done', 'failed'));--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD CONSTRAINT "repo_index_state_status_chk" CHECK ("repo_index_state"."status" IN ('full', 'partial', 'degraded', 'failed'));