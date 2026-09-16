ALTER TABLE "agent_runs" ADD COLUMN "multi_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_multi_run_id_multi_agent_runs_id_fk" FOREIGN KEY ("multi_run_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE set null ON UPDATE no action;