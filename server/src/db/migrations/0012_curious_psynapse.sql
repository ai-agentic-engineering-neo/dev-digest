ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at" DESC NULLS LAST);