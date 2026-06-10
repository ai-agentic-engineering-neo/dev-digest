CREATE TABLE "file_edges" (
	"repo_id" uuid NOT NULL,
	"from_file" text NOT NULL,
	"to_file" text NOT NULL,
	CONSTRAINT "file_edges_repo_id_from_file_to_file_pk" PRIMARY KEY("repo_id","from_file","to_file")
);
--> statement-breakpoint
CREATE TABLE "file_facts" (
	"repo_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"endpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"crons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "file_facts_repo_id_file_path_pk" PRIMARY KEY("repo_id","file_path")
);
--> statement-breakpoint
CREATE TABLE "repo_index_state" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"last_indexed_sha" text NOT NULL,
	"indexer_version" integer NOT NULL,
	"status" text NOT NULL,
	"files_indexed" integer DEFAULT 0 NOT NULL,
	"files_skipped" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "decl_file" text;--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "end_line" integer;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "exported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "file_edges" ADD CONSTRAINT "file_edges_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_facts" ADD CONSTRAINT "file_facts_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_index_state" ADD CONSTRAINT "repo_index_state_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_edges_repo_to_idx" ON "file_edges" USING btree ("repo_id","to_file");--> statement-breakpoint
CREATE INDEX "references_repo_decl_symbol_idx" ON "references" USING btree ("repo_id","decl_file","to_symbol");--> statement-breakpoint
CREATE INDEX "references_repo_from_idx" ON "references" USING btree ("repo_id","from_path");--> statement-breakpoint
CREATE INDEX "symbols_repo_path_idx" ON "symbols" USING btree ("repo_id","path");--> statement-breakpoint
CREATE INDEX "symbols_repo_name_idx" ON "symbols" USING btree ("repo_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "symbols_repo_path_name_kind_line_uq" ON "symbols" USING btree ("repo_id","path","name","kind","line");