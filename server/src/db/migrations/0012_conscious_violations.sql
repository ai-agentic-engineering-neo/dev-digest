CREATE TABLE "agent_run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "agent_run_skills_run_id_skill_id_pk" PRIMARY KEY("run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_skills_skill_idx" ON "agent_run_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_workspace_name_unique" ON "skills" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "skills_workspace_idx" ON "skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_skills_skill_idx" ON "agent_skills" USING btree ("skill_id");