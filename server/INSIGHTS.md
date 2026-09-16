# INSIGHTS — server

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [CLAUDE.md](CLAUDE.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

**2026-09-16** — `reviewer-core/src/review/run.ts`'s `reviewPullRequest()` already sums per-call `costUsd` into `ReviewOutcome.costUsd` (LLM pricing math lives in `server/src/platform/price-book.ts` + `server/src/adapters/llm/pricing.ts` / `reviewer-core/src/llm/openrouter.ts`) — wiring a new cost field through to `agent_runs` is pure plumbing (destructure + persist), no new pricing logic needed. Evidence: `reviewer-core/src/review/run.ts:110,159-184,216`, `server/src/modules/reviews/run-executor.ts:213`.

**2026-09-16** — `server/src/modules/pulls/routes.ts`'s per-PR list `score` is computed from the single *latest* `reviews` row per PR (by `createdAt`, the `latestReviewByPr` map) — that pattern does NOT generalize to every per-PR list field. Evidence: `server/src/modules/pulls/routes.ts:114-130`.

**2026-09-16** — Correction to the entry above: `cost_usd` on the PR list is deliberately NOT "latest review only" like `score` — it's a lifetime sum of `cost_usd` across every `status='done'` `agent_runs` row for the PR (`costByPr` map), computed independently of `latestReviewByPr`. A PR with no done runs, or whose done runs never captured cost, stays `null` (never `0`) — only add a run's cost to the sum when `costUsd != null`, and track that separately (`hasCost`) from the numeric sum so an all-null PR doesn't render as "$0.00". Evidence: `server/src/modules/pulls/routes.ts:132-150`.

## Gotchas & Recurring Errors

**2026-09-16** — `RunStats`/`RunSummary` in `vendor/shared/contracts/trace.ts` type their numeric run fields `z.number().nullable()`, not `.nullish()` — the key is required even when the value is `null`. Every literal builder of a `RunStats`/`RunSummary`-shaped object (including `run-executor.ts`'s failure-path `traceFromBuffer()`, and any test fixture) must be updated in lockstep when a new stat field is added, or it fails to typecheck. Evidence: `server/src/modules/reviews/run-executor.ts:428` (`traceFromBuffer`), `server/test/contracts.test.ts:160`.

## Open Questions

## Session Notes
