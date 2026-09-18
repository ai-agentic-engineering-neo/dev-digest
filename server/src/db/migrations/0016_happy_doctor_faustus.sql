ALTER TABLE "repos" ADD COLUMN "conventions_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "conventions_sample_count" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_start_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_end_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");