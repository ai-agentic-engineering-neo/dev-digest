ALTER TABLE "onboarding" ADD COLUMN "index_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "indexer_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "index_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_indexed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_excluded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "prs_weighted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;