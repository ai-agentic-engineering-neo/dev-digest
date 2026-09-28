ALTER TABLE "pull_requests" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "risk_areas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "text_hash" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "derived_at" timestamp with time zone DEFAULT now() NOT NULL;