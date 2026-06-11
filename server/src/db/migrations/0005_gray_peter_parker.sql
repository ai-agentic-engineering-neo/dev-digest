CREATE TABLE "file_rank" (
	"repo_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"pagerank" double precision NOT NULL,
	"hotness" double precision NOT NULL,
	"rank" double precision NOT NULL,
	"percentile" smallint NOT NULL,
	CONSTRAINT "file_rank_repo_id_file_path_pk" PRIMARY KEY("repo_id","file_path")
);
--> statement-breakpoint
CREATE TABLE "repo_map_cache" (
	"repo_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"token_budget" integer NOT NULL,
	"map_text" text NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_map_cache_repo_id_commit_sha_token_budget_pk" PRIMARY KEY("repo_id","commit_sha","token_budget")
);
--> statement-breakpoint
ALTER TABLE "file_rank" ADD CONSTRAINT "file_rank_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_map_cache" ADD CONSTRAINT "repo_map_cache_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_rank_repo_rank_idx" ON "file_rank" USING btree ("repo_id","rank");