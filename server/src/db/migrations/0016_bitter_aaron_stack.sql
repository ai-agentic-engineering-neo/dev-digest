CREATE INDEX "pr_files_pr_id_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_path_pr_id_idx" ON "pr_files" USING btree ("path","pr_id");