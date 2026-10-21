CREATE TABLE "onboarding_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provider" text,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision,
	"files_indexed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_indexed" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "limited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_runs_ws_repo_started_idx" ON "onboarding_runs" USING btree ("workspace_id","repo_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_runs_one_running_uidx" ON "onboarding_runs" USING btree ("repo_id") WHERE "onboarding_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_run_id_onboarding_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."onboarding_runs"("id") ON DELETE set null ON UPDATE no action;