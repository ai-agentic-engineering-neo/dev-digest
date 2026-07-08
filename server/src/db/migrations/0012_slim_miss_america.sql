ALTER TABLE "ci_installations" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_installation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "external_pr_number" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actions_run_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actions_job_url" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_ci_installation_id_ci_installations_id_fk" FOREIGN KEY ("ci_installation_id") REFERENCES "public"."ci_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_ci_installation_id_idx" ON "agent_runs" USING btree ("ci_installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_ci_installation_actions_run_uq" ON "agent_runs" USING btree ("ci_installation_id","actions_run_id");