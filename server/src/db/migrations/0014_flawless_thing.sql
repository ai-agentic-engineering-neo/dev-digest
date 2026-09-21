ALTER TABLE "pull_requests" ADD COLUMN "intent_summary" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "intent_confidence" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "intent_signals" jsonb;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "intent_resolved_at" timestamp with time zone;