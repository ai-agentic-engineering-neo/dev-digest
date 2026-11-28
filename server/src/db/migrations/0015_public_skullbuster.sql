UPDATE "skill_versions" AS sv SET "name" = s."name", "description" = s."description", "type" = s."type" FROM "skills" AS s WHERE s."id" = sv."skill_id" AND sv."name" = '';--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "description" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "agent_skills_skill_id_idx" ON "agent_skills" USING btree ("skill_id");
