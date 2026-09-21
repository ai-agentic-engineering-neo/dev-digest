DROP INDEX "eval_runs_owner_idx";--> statement-breakpoint
CREATE INDEX "eval_runs_owner_idx" ON "eval_runs" USING btree ("workspace_id","owner_kind","owner_id","ran_at" desc);