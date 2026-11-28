CREATE INDEX "reviews_run_idx" ON "reviews" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "reviews_agent_idx" ON "reviews" USING btree ("agent_id");