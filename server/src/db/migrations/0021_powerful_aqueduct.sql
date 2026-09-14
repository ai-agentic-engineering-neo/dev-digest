ALTER TABLE "eval_runs" DROP CONSTRAINT "eval_runs_case_id_eval_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "eval_runs" DROP COLUMN "case_id";--> statement-breakpoint
ALTER TABLE "eval_runs" DROP COLUMN "actual_output";--> statement-breakpoint
ALTER TABLE "eval_runs" DROP COLUMN "pass";