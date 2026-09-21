ALTER TABLE "ci_runs" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text NOT NULL;