CREATE TABLE "ci_installation_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ci_installation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ci_installation_agents" ADD CONSTRAINT "ci_installation_agents_ci_installation_id_ci_installations_id_fk" FOREIGN KEY ("ci_installation_id") REFERENCES "public"."ci_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_installation_agents" ADD CONSTRAINT "ci_installation_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installation_agents_uq" ON "ci_installation_agents" USING btree ("ci_installation_id","agent_id");--> statement-breakpoint
CREATE INDEX "ci_installation_agents_agent_idx" ON "ci_installation_agents" USING btree ("agent_id");--> statement-breakpoint
-- Backfill: every installation that existed before the roster table becomes a
-- one-agent roster. Without this, the generator (which reads ONLY the roster)
-- would regenerate an already-installed repo's bundle with no manifests at all.
INSERT INTO "ci_installation_agents" ("ci_installation_id", "agent_id")
SELECT "id", "agent_id" FROM "ci_installations"
ON CONFLICT DO NOTHING;
