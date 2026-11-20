# server — insights

Non-obvious lessons that the code and README don't tell you. Maintained by `/engineering-insights`
(`.claude/skills/engineering-insights/`); read it before working here.
**Append-only:** insert new lines directly under a section heading (newest first); never edit or
delete existing ones — correct with a new `Supersedes YYYY-MM-DD: …` line. Pruning is a manual monthly review.
Entry: `- YYYY-MM-DD — <what, concrete> — <path + symbol> — <what to do>`

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 — `PromptCache` in `platform/model-router.ts` defaults to `now = () => 0`, so entries never expire — pass a real clock if you ever wire it.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
