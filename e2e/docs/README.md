# docs — e2e

Deep-dives for the e2e suite (design rationale, decisions). Note:
`e2e/specs/` already holds agent-browser flow definitions, not narrative
specs.

## Hermetic vs. local runner — why both exist, and when each is safe

`./scripts/e2e.sh` boots an isolated Postgres/API/web stack on alternate
ports (`:5433`/`:3101`/`:3100`), seeds it fresh, runs the flows, and tears
everything down — safe to run anytime, alongside your normal dev stack,
because it never touches `devdigest_pgdata` or your real dev DB.

`npm test` (`tsx run.ts`) against your own already-running dev stack is
**only** safe if your dev DB currently holds *exactly* the seeded demo repo
(`acme/payments-api`) and nothing else. Flows `02`/`04`/`05` assume the home
redirect lands on the *first* repo and that it's the seeded one — CI's fresh
Postgres guarantees this; a real dev machine that's imported other repos
along the way will fail those flows for a reason that has nothing to do with
the feature under test. This is why the README leads with the hermetic
runner as the default: it removes an entire class of "works on CI, fails
locally" confusion that has nothing to do with a real regression.

## Why a new flow was added for the severity pills (`08-severity-pills.flow.json`)

The rubric this feature was built against described a literal five-step
click path (open PR → Agent runs tab → Review runs → expand a run card →
click a severity pill). That's exactly what `agent-browser`'s deterministic
locators are good at proving end-to-end, and unlike the PR-list/Timeline
hover popovers (Phase B), the accordion pills are fully click-based — no
hover simulation needed, so no uncertainty about what `agent-browser`
supports. The flow asserts both a presence AND a disappearance (a finding of
a different severity is gone after filtering) — a presence-only assertion
would pass even if filtering silently did nothing.
