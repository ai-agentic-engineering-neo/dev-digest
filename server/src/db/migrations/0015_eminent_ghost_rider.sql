CREATE TABLE "context_doc_overrides" (
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"text" text NOT NULL,
	"sha" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_doc_overrides_repo_id_path_pk" PRIMARY KEY("repo_id","path")
);
--> statement-breakpoint
ALTER TABLE "context_doc_overrides" ADD CONSTRAINT "context_doc_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc_overrides" ADD CONSTRAINT "context_doc_overrides_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;