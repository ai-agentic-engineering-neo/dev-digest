CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_kind_idx" ON "reviews" USING btree ("pr_id","kind");--> statement-breakpoint
CREATE INDEX "reviews_agent_idx" ON "reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_status_idx" ON "agent_runs" USING btree ("pr_id","status");