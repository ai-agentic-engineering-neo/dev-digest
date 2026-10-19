ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_workspace_name_uq" ON "skills" USING btree ("workspace_id","name");