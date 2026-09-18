# e2e/docs

Deeper reference material for `e2e` that doesn't belong in [`../AGENTS.md`](../AGENTS.md) (too detailed/stable to re-read every session) or in [`../README.md`](../README.md) (too deep for a human-facing overview).

Add files here for things like: hermetic-stack architecture notes, flaky-flow investigations, decisions that don't fit `INSIGHTS.md`'s running-log format.

See [`specs/`](./specs/) for feature specifications — not to be confused with [`../specs/`](../specs/), which holds browser flow definitions (`*.flow.json`), a different thing with the same name.

## Flow coverage (as it stands)

No feature work has touched this package on the `L01` branch — the cost/
findings-visibility work (see
[`server/docs/specs/02-spec-cost-and-findings-tracking`](../../server/docs/specs/02-spec-cost-and-findings-tracking/02-spec-cost-and-findings-tracking.md))
was verified by unit/component tests plus a manual browser check, not a new
flow file, so there's no `L01` feature spec here either. For reference, the
closest existing flow to that work is
[`../specs/04-pr-findings.flow.json`](../specs/04-pr-findings.flow.json):
it opens the seeded PR #482, switches to the Agent runs tab, and asserts the
seeded review run's verdict/finding-count/`FindingCard` render — the same
`ReviewRunAccordion`/`FindingsPanel` surface whose severity-pill filtering
was fixed in this round (see `client/INSIGHTS.md`'s 2026-09-16 Mistake
entry). It does not exercise the PR-list FINDINGS popover or the pill
filter interaction itself, since flows here assert seeded read state
(`--text`/`--url` waits), not click-driven filter toggling — a gap worth
closing with a new flow if this surface grows more logic.

Seven flows total (`01`–`07`), each named for the surface it covers — see
[`../README.md`](../README.md)'s coverage table for the full list and what
each one asserts.
