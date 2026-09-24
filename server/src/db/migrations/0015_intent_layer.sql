ALTER TABLE "findings" ADD COLUMN "out_of_scope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "change_type" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "derived_from" text DEFAULT 'inferred' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "prompt_version" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "derived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_change_type_chk" CHECK ("pr_intent"."change_type" IN ('feature', 'bugfix', 'refactor', 'docs', 'test', 'chore', 'security', 'perf', 'mixed'));--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_derived_from_chk" CHECK ("pr_intent"."derived_from" IN ('explicit', 'inferred'));--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_chk" CHECK ("pr_intent"."confidence" IN ('high', 'medium', 'low'));