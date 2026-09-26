ALTER TABLE "skill_versions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;