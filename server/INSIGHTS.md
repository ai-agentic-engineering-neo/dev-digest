# server — insights

Non-obvious lessons that the code and README don't tell you. Maintained by `/engineering-insights`
(`.claude/skills/engineering-insights/`); read it before working here.
**Append-only:** insert new lines directly under a section heading (newest first); never edit or
delete existing ones — correct with a new `Supersedes YYYY-MM-DD: …` line. Pruning is a manual monthly review.
Entry: `- YYYY-MM-DD — <what, concrete> — <path + symbol> — <what to do>`

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 — Run cost is already computed end to end (`reviewPullRequest` → `ReviewOutcome.costUsd`; OpenRouter sends `usage: { include: true }` and uses the real `usage.cost`), but `run-executor.ts` drops it because migration `0009` removed `agent_runs.cost_usd` — re-add the column; don't build a new pricing path.

- 2026-11-20 — `PromptCache` in `platform/model-router.ts` defaults to `now = () => 0`, so entries never expire — pass a real clock if you ever wire it.

## Tool & Library Notes

- 2026-11-20 — Drizzle `sum(col)` is typed and returned as `string | null` even for `double precision` (pg numeric aggregate) — `modules/pulls/routes.ts` list cost — convert with `Number()` after the null check, or the JSON ships `"0.001"`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
