ALTER TABLE "pull_requests" ADD COLUMN "intent_in_scope" jsonb;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "intent_out_of_scope" jsonb;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "intent_context_gaps" jsonb;