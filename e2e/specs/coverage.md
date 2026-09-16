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
| `02-repo-pulls-detail` | PR list → PR detail route navigation works end to end |
| `03-agents` | The agents list renders both seeded built-in reviewer agents |
| `04-pr-findings` | A seeded run's verdict + findings render in the Agent runs tab; a finding expands into a `FindingCard` |
| `05-pr-diff` | The Files changed tab renders a seeded file in the diff viewer |
| `06-onboarding` | The add-repository form renders (form only — no submit, no real import) |
| `07-settings` | Both settings sections (`api-keys`, `models`) render their section titles |

## Explicitly NOT covered

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
