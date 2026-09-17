ALTER TABLE "agent_runs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;