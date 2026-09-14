CREATE TABLE "run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"tokens" integer NOT NULL,
	CONSTRAINT "run_skills_run_id_skill_id_pk" PRIMARY KEY("run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_skills_skill_idx" ON "run_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_ws_name_uq" ON "skills" USING btree ("workspace_id","name");