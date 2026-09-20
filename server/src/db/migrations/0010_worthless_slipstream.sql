ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "critical_count" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "warning_count" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "suggestion_count" integer;