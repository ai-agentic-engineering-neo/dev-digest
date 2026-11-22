# Cost badge

**Route:** `/repos/:repoId/pulls`, `/repos/:repoId/pulls/:number` (Agent runs card and run drawer)
**Status:** accepted

## Goal
Show what each agent review cost, per run and per pull request, so a reviewer can
see which reviews are expensive without opening the provider's billing page.

## Behavior
- **PR list:** a Cost column sits between Status and Updated. It shows the total cost
  of all agent runs on that PR.
- **PR details, Agent runs card:** each run row shows its total tokens and its cost on
  the right, under the time: `9,119 tok · $0.0013`.
- **Run details drawer:** the Stats block gets a COST tile next to DURATION, TOKENS and
  FINDINGS.
- Cost is an **estimate** derived when the page loads: the run's token usage
  (`tokens_in`, `tokens_out`) multiplied by the model's price. Prices come from the
  live OpenRouter price list when available, and from the server's static price table
  otherwise. Nothing is stored per run, so the figure can change if prices change.
- Formatting: under $0.01 → 4 decimals; under $1 → 3 decimals; otherwise 2 decimals.

## Acceptance criteria
- [ ] Given a done run with a priced usage, when the run row renders, then it shows the total tokens and the cost in the adaptive format.
- [ ] Given a done run with no usage data, when the run row renders, then cost reads `-`, not `$0.00`.
- [ ] Given a model with no price and usage data, when the run renders, then cost reads `-`.
- [ ] Given a failed or cancelled run, when the run row renders, then cost reads `-` and no token total is shown.
- [ ] Given a PR with at least one priced run, when the PR list renders, then the Cost column shows the sum of the priced runs.
- [ ] Given a PR with no priced run, when the PR list renders, then the Cost column reads `-`.
- [ ] Given an older run with usage and a known model, when its row or drawer renders, then it shows the estimated cost (no backfill is needed).
- [ ] A missing cost is never rendered as `$0.00` in any of the three places.

## Out of scope
- Findings column, Run Review button, Auto-review header and Triage queue shown in the mock.
- Budgets, alerts, or cost trend charts.
- Cost for CI runs and eval runs.
- Storing cost per run (a schema change). Cost is computed on read; a stored value is a possible follow-up.
