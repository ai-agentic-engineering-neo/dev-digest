ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "input_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "confidence" double precision NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "confidence_level" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "primary_source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "sources_used" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "risk_areas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "tokens_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "tokens_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" DROP CONSTRAINT IF EXISTS "pr_intent_confidence_level_check";--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_level_check" CHECK ("pr_intent"."confidence_level" IN ('low','medium','high'));--> statement-breakpoint
ALTER TABLE "pr_intent" DROP CONSTRAINT IF EXISTS "pr_intent_primary_source_check";--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_primary_source_check" CHECK ("pr_intent"."primary_source" IN ('description','linked_issue','plan_spec','commits','branch','file_paths'));