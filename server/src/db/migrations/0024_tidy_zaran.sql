ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "branch" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "base" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_export_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "provider_run_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_source" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "ingested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_tuple_uq" ON "ci_installations" USING btree ("workspace_id","agent_id","repo","target_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_repo_uq" ON "ci_installations" USING btree ("workspace_id","repo");--> statement-breakpoint
CREATE INDEX "ci_installations_ws_agent_idx" ON "ci_installations" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_provider_run_uq" ON "ci_runs" USING btree ("workspace_id","provider_run_id");--> statement-breakpoint
CREATE INDEX "ci_runs_list_idx" ON "ci_runs" USING btree ("workspace_id","ran_at" desc);