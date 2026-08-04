# INSIGHTS — client

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line, never edit or delete history silently.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule; this file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it. See the repo's `engineering-insights` skill for the full
workflow and quality bar.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-07-27 — `src/vendor/shared` here is a **trimmed subset** of the
  server's `@devdigest/shared`, hand-copied — not just a mirror. It's missing
  `AgentManifest`, the OpenRouter `sessionId` field, and the `'openrouter'`
  provider id that exist server-side. Before assuming a contract is "not
  built yet," check whether it simply wasn't copied over.
  (`client/src/vendor/shared/contracts/eval-ci.ts` and
  `client/src/vendor/shared/adapters.ts` vs
  `server/src/vendor/shared/contracts/eval-ci.ts:144-172`,
  `server/src/vendor/shared/adapters.ts:64-69,83`)

## Tool & Library Notes

- 2026-08-04 — A real review run against the live OpenRouter API (deepseek-v4-flash,
  a small diff) cost exactly `$0.000272979` — i.e. a normal, non-degenerate
  review can legitimately land under $0.001. `formatCost`'s `<$0.001` branch
  isn't a theoretical edge case for a broken/free model; it's the realistic
  common case for a cheap model on a small PR, so don't assume it's rare.
  (`client/src/lib/format.ts:10`)

## Recurring Errors & Fixes

## Open Questions

## Session Notes

- 2026-08-04 — `engineering-insights` did not auto-invoke during the whole
  `feat/review-cost` session (a multi-file feature with real findings — see
  above) despite matching its own "end of a non-trivial coding session"
  trigger in its `SKILL.md` description. It only ran because the user
  explicitly asked whether it had fired. Confirms the skill's own
  "Course arc" note in `references.md`: a description/manual trigger alone
  is not reliable enough without a `Stop` hook forcing it.
