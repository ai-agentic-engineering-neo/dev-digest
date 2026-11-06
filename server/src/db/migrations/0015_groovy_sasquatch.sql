ALTER TABLE "pr_intent" ALTER COLUMN "intent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "kind" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence_reason" text DEFAULT 'indirect_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence_lowered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "body_hash" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "override_intent" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "override_in_scope" jsonb;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "override_out_of_scope" jsonb;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "override_head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;