CREATE TABLE "agent_run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_version" integer NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "agent_run_skills_run_id_skill_id_pk" PRIMARY KEY("run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_source_chk";--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "skill_name" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_skills" ADD CONSTRAINT "agent_run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_skills_skill_idx" ON "agent_run_skills" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_skill_idx" ON "findings" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_ws_name_uq" UNIQUE("workspace_id","name");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_name_len_chk" CHECK (length("skills"."name") BETWEEN 1 AND 64);--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_chk" CHECK ("skills"."source" IN ('manual', 'imported_file', 'imported_url', 'extracted', 'community'));