ALTER TABLE "skill_versions" ADD COLUMN "restored_from" integer;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "injection_detected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "injection_matches" jsonb DEFAULT '[]'::jsonb NOT NULL;