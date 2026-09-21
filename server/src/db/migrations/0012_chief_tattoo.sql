CREATE TABLE "agent_run_skills" (
	"agent_run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "agent_run_skills_agent_run_id_skill_id_pk" PRIMARY KEY("agent_run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_skills_skill_idx" ON "agent_run_skills" USING btree ("skill_id");