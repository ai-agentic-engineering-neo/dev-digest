CREATE TABLE "file_exports" (
	"repo_id" uuid NOT NULL,
	"file" text NOT NULL,
	"exported_name" text NOT NULL,
	"local_name" text,
	"kind" text NOT NULL,
	"specifier" text,
	"resolved_file" text,
	"line" integer NOT NULL,
	CONSTRAINT "file_exports_repo_id_file_exported_name_kind_pk" PRIMARY KEY("repo_id","file","exported_name","kind")
);
--> statement-breakpoint
CREATE TABLE "file_imports" (
	"repo_id" uuid NOT NULL,
	"from_file" text NOT NULL,
	"idx" integer NOT NULL,
	"local_name" text NOT NULL,
	"imported_name" text NOT NULL,
	"specifier" text NOT NULL,
	"is_type" boolean DEFAULT false NOT NULL,
	"kind" text NOT NULL,
	"line" integer NOT NULL,
	"resolved_file" text,
	"unresolved_reason" text,
	CONSTRAINT "file_imports_repo_id_from_file_idx_pk" PRIMARY KEY("repo_id","from_file","idx")
);
--> statement-breakpoint
CREATE TABLE "symbol_edges" (
	"repo_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"from_name" text NOT NULL,
	"to_path" text NOT NULL,
	"to_name" text NOT NULL,
	"kind" text NOT NULL,
	"confidence" text NOT NULL,
	"line" integer NOT NULL,
	CONSTRAINT "symbol_edges_repo_id_from_path_from_name_to_path_to_name_kind_line_pk" PRIMARY KEY("repo_id","from_path","from_name","to_path","to_name","kind","line")
);
--> statement-breakpoint
ALTER TABLE "pr_files" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "pr_files" ADD COLUMN "previous_path" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "base_sha" text;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD COLUMN "coverage" jsonb;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD COLUMN "reindex_state" text;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD COLUMN "reindex_done" integer;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD COLUMN "reindex_total" integer;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD COLUMN "tsconfig_failures" jsonb;--> statement-breakpoint
ALTER TABLE "file_exports" ADD CONSTRAINT "file_exports_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_imports" ADD CONSTRAINT "file_imports_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_edges" ADD CONSTRAINT "symbol_edges_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_exports_repo_resolved_idx" ON "file_exports" USING btree ("repo_id","resolved_file");--> statement-breakpoint
CREATE INDEX "file_imports_repo_resolved_idx" ON "file_imports" USING btree ("repo_id","resolved_file");--> statement-breakpoint
CREATE INDEX "file_imports_repo_from_idx" ON "file_imports" USING btree ("repo_id","from_file");--> statement-breakpoint
CREATE INDEX "symbol_edges_repo_to_idx" ON "symbol_edges" USING btree ("repo_id","to_path","to_name");--> statement-breakpoint
CREATE INDEX "symbol_edges_repo_from_idx" ON "symbol_edges" USING btree ("repo_id","from_path");