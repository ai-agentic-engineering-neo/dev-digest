CREATE TABLE "devdigest_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"copied_from" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devdigest_docs_path_check" CHECK (starts_with("devdigest_docs"."path", '.devdigest/specs/')),
	CONSTRAINT "devdigest_docs_size_check" CHECK (octet_length("devdigest_docs"."content") <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "devdigest_docs" ADD CONSTRAINT "devdigest_docs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devdigest_docs" ADD CONSTRAINT "devdigest_docs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devdigest_docs_repo_path_uq" ON "devdigest_docs" USING btree ("repo_id","path");--> statement-breakpoint
CREATE INDEX "devdigest_docs_ws_idx" ON "devdigest_docs" USING btree ("workspace_id");