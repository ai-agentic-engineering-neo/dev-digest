ALTER TABLE "skill_versions" ADD COLUMN "context_paths" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;