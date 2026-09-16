# spec — e2e coverage

What the flows in this folder guarantee, and what they explicitly don't.
The `.flow.json` files next to this doc are the executable steps; this file
is the behavioral read of what passing them actually proves. Cross-check
against [`../../client/specs/pages.md`](../../client/specs/pages.md) for the
full page-level contract — not everything specified there is exercised here.

## Covered (typological, not exhaustive)

| Flow | Guarantees |
|---|---|
| `01-app-boot` | Cold start renders; root redirects to the seeded repo's PR list; the seeded PR is visible |
| `02-repo-pulls-detail` | The PR list's Findings column header renders; PR list → PR detail route navigation works end to end |
| `03-agents` | The agents list renders both seeded built-in reviewer agents |
| `04-pr-findings` | A seeded run's verdict + findings render in the Agent runs tab; a finding expands into a `FindingCard` |
| `05-pr-diff` | The Files changed tab renders a seeded file in the diff viewer |
| `06-onboarding` | The add-repository form renders (form only — no submit, no real import) |
| `07-settings` | Both settings sections (`api-keys`, `models`) render their section titles |

## Explicitly NOT covered

- **The findings-counter hover popover** (PR list Findings column, PR detail
  Timeline) — agent-browser's locator set here is deterministic
  click/text/role only (see [`../CLAUDE.md`](../CLAUDE.md)); there's no
  hover primitive to drive it. Covered instead by client unit tests
  (`FindingsSummary/helpers.test.ts`, `PRRow.test.tsx`, `RunHistory.test.tsx`).
- **The Review-runs severity filter pills** (click a pill to narrow the
  finding list to one severity) — `wait`/`find` here only assert that text
  *is* present, with no "assert absence" primitive to confirm a filtered-out
  finding disappeared after a click. Covered instead by client unit tests
  (`FindingsPanel.test.tsx`'s "severity filter pills" suite).
- **The Timeline's per-run severity counter** — the seeded PR #482 review
  predates run-linking (no `run_id`), so its Timeline has no run row to carry
  a counter. `04-pr-findings` still exercises the same counts at the
  "Review runs" accordion level ("2 findings").
- **Triggering a real review run** — every flow uses pre-seeded run/finding
  data; none clicks "Review" and waits for an LLM call (would need a key and
  break determinism).
- **Error/failure states** — no flow simulates a failed import, a failed run,
  or an API error response.
- **Form submission** — `06-onboarding` checks the form renders, not that
  submitting it imports a repo.
- **Auth** — the starter has none to cover.

A gap here is a candidate for a new flow, not a reason to widen an existing
one past its stated guarantee — keep one flow's intent single-purpose per
[`../docs/flows.md`](../docs/flows.md).
