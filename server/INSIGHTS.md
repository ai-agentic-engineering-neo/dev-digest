# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Recurring Errors & Fixes

- **2026-09-17** — `drizzle-kit generate` fails in this dev environment with
  an esbuild/Rosetta architecture mismatch (`@esbuild/darwin-arm64` present,
  platform needs `@esbuild/darwin-x64`, or vice versa). Workaround: hand-author
  the migration SQL plus a `meta/NNNN_snapshot.json` (copy the prior
  snapshot, patch only the changed table's `columns`, bump `id`/set `prevId`
  to the previous snapshot's `id`) and a matching `meta/_journal.json` entry.
  Verified correct by diffing against a later commit's real `drizzle-kit`
  output for the identical column (`0010_add_agent_run_cost.sql` matched
  `93119a5`'s `0010_polite_sasquatch.sql` byte-for-byte) and by the
  Docker-gated integration tests passing against the real migrated schema.
  General playbook for this class of issue (recognize it, don't "fix" the
  global toolchain, scoped workarounds per command):
  `.claude/skills/esbuild-arch-mismatch/SKILL.md`.

## Tool & Library Notes

- **2026-09-17** — A Fastify route with no declared `schema.response` and a
  bare object return correctly drops an `undefined`-valued key from the JSON
  wire response (confirmed empirically, not just assumed) — this is the
  mechanism behind "field omitted vs. field null" distinctions, e.g.
  `PrMeta.cost_usd` is absent for a PR with zero runs but `null` for a run
  that exists with unknown cost. Evidence: `server/src/modules/pulls/routes.ts`,
  asserted via `'cost_usd' in pr === false` in `server/test/reviews.it.test.ts`.
- **2026-09-17** — `MockLLMProvider.complete`/`.completeStructured`
  (`src/adapters/mocks.ts`) already return a fixed `costUsd: 0.001` — no mock
  changes are needed to write cost-related test assertions.

## Codebase Patterns

- **2026-09-17** — `ReviewService.runReview()` creates every `agent_runs` row
  for a multi-agent "Review all" click up front, in ONE synchronous loop,
  before any LLM call starts (`service.ts`, "Create the agent_run rows up
  front..."). True batch-mates therefore share a `ran_at` within
  milliseconds, not seconds — a time-window heuristic reconstructing "which
  runs belong to the same click" (no persisted batch id exists) should stay
  tight (single-digit seconds), or it risks merging two separate, later
  clicks into one inflated total.

## What Doesn't Work

- **2026-09-17** — Auditing every `outcome.<field>` read site is required
  whenever `ReviewOutcome`'s shape changes. `run-executor.ts` silently
  dropped `outcome.costUsd` for a long stretch via an incomplete
  `const { tokensIn, tokensOut, grounding } = outcome` destructure — the
  field was fully computed upstream (reviewer-core, LLM adapters) the whole
  time, just never read at the one call site that mattered.
- **2026-09-17** — The seeded demo PR (`acme/payments-api` #482) can NEVER
  produce findings, regardless of which agent reviews it or how many times.
  `server/src/db/seed.ts` inserts `pr_files` rows with no `patch`, and
  `server/src/modules/reviews/diff-loader.ts:37` (`if (!f.patch) continue;`)
  skips any file with no patch — so every review sees a genuinely empty
  diff. Not a regression from any lesson's work; it's a property of the
  starter seed. The only way around it is importing a real PR from an
  actual GitHub repo (a `GITHUB_TOKEN` is already supported via
  `~/.devdigest/secrets.json`) — not done as of this entry.
