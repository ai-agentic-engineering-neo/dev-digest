ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence_basis" text DEFAULT 'indirect_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "downgraded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "input_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;