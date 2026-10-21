CREATE UNIQUE INDEX "skills_ws_name_uidx" ON "skills" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "convention_scans_ws_repo_started_idx" ON "convention_scans" USING btree ("workspace_id","repo_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "convention_scans_one_running_uidx" ON "convention_scans" USING btree ("repo_id") WHERE "convention_scans"."status" = 'running';--> statement-breakpoint
CREATE INDEX "conventions_ws_repo_idx" ON "conventions" USING btree ("workspace_id","repo_id");--> statement-breakpoint
CREATE INDEX "conventions_scan_idx" ON "conventions" USING btree ("scan_id");