ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
-- Backfill: runs recorded before this column existed kept their cost only in
-- the run trace document (run_traces.trace.stats.cost_usd).
UPDATE "agent_runs" AS ar
SET "cost_usd" = (rt."trace" -> 'stats' ->> 'cost_usd')::double precision
FROM "run_traces" AS rt
WHERE rt."run_id" = ar."id"
  AND ar."status" = 'done'
  AND ar."cost_usd" IS NULL
  AND jsonb_typeof(rt."trace" -> 'stats' -> 'cost_usd') = 'number';
