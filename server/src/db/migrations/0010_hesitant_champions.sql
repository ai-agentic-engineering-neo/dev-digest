ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "batch_id" uuid;