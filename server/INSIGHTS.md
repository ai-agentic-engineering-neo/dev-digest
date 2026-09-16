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

**2026-09-16** — `PrMeta.findings_summary` (the list's per-severity counters) follows `score`'s "latest review only" pattern, not `cost_usd`'s lifetime-sum pattern: it reuses the same `latestReviewByPr` map (extended with the review `id`) and one batched `findings WHERE review_id IN (latestReviewIds) AND dismissed_at IS NULL`-equivalent query, then groups in JS via `summarizeFindings()`. `counts` and `items` are guaranteed to agree (not just plausibly equal) because both are derived from the exact same filtered array (`kept`) inside one function — pinned by a test that loops all three severities and asserts `counts[sev] === items.filter(...).length`. The whole path (DB read → JS filter/sort) is one query + pure grouping, with zero LLM or other network calls. Evidence: `server/src/modules/reviews/helpers.ts:95-122` (`summarizeFindings`), `server/src/modules/pulls/routes.ts:133-151`, `server/test/reviews-helpers.test.ts:90-98` (invariant test).

**2026-09-16** — Correction to the entry above: "latest review only" for `findings_summary` was a real product gap, caught live against a real (non-seed) DB — a "review all" click creates one `agent_runs` row per agent back-to-back (near-identical `ranAt`), but each agent's OWN `reviews` row is written later, whenever ITS LLM call finishes (seconds apart, LLM-latency-dependent) — so "pick the review with the newest `created_at`" silently dropped an earlier-finishing agent's findings from the very same click (e.g. Security Reviewer's WARNING vanished from the list once General Reviewer finished a moment later with 0 findings). Fixed by clustering `agent_runs.ranAt` into a "round" (`latestRoundRunIds()`, `ROUND_WINDOW_MS = 10_000`ms — generous vs. the sub-second gap between back-to-back inserts, but far short of any realistic gap between two separate clicks) and summing findings from every `kind='review'` review whose `run_id` falls in the PR's latest round, not just one. **`score` was deliberately left untouched** (still single-latest-review) since it's a separate, pre-existing field outside this feature's scope — so `score` and `findings_summary` can now visibly disagree on which agent(s) they reflect from the same round. A PR with zero `agent_runs` (only a hand-seeded review) still falls back to the single latest review. Evidence: `server/src/modules/reviews/helpers.ts` (`latestRoundRunIds`, `ROUND_WINDOW_MS`), `server/src/modules/pulls/routes.ts` (findings_summary block), `server/test/reviews-helpers.test.ts` ("latestRoundRunIds" suite), `server/test/reviews.it.test.ts` ("SUMS every agent from the latest round" / "excludes an OLDER, separate round" tests, using a direct-DB-seed `seedRoundReview()` helper since `MockLLMProvider` can't return different fixtures per agent within one app instance).

## Gotchas & Recurring Errors

**2026-09-16** — `RunStats`/`RunSummary` in `vendor/shared/contracts/trace.ts` type their numeric run fields `z.number().nullable()`, not `.nullish()` — the key is required even when the value is `null`. Every literal builder of a `RunStats`/`RunSummary`-shaped object (including `run-executor.ts`'s failure-path `traceFromBuffer()`, and any test fixture) must be updated in lockstep when a new stat field is added, or it fails to typecheck. Evidence: `server/src/modules/reviews/run-executor.ts:428` (`traceFromBuffer`), `server/test/contracts.test.ts:160`.

## Open Questions

**2026-09-16** — Should `findings_summary` (and `score`) stay a "what did the latest round find" snapshot, or should findings persist/accumulate across reviews until explicitly resolved/dismissed? Right now a REAL, still-unfixed CRITICAL from an older review silently disappears from every counter the moment a newer round supersedes it — even if that newer round found nothing only because of an unrelated environment problem, not because the issue was fixed. Observed live on acme/payments-api PR #482: a 2026-09-14 seeded review flagged a hardcoded Stripe secret key (CRITICAL), but the PR list now reads "Findings: 0" because three 2026-09-16 real agent runs (one round, per `latestRoundRunIds`) found nothing — not because the secret was removed, but because `clone_path` was null so the diff was empty and the code was never actually re-examined. The user explicitly deferred this as a separate decision, not yet resolved either way.

## Session Notes
