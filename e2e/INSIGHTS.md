# e2e — insights

Things that are true about `e2e/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).
Agents write here only through the `engineering-insights` skill, whose script
inserts lines and never changes existing ones.

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## What works

## What doesn't work

## Codebase patterns

## Tool & library notes

- **2026-09-23** — Flows fail with `spawn agent-browser ENOENT` without the global
  CLI. Instead of `npm i -g agent-browser && agent-browser install`, which downloads
  Chrome for Testing, point the runner at any install and at the system Chrome:
  `AGENT_BROWSER_BIN=<path>/agent-browser
  AGENT_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  npm run e2e:hermetic` → 7/7 passed. Evidence: `run.ts:40`, `README.md:52-53`.

## Recurring errors & fixes

## Doc drift

- **2026-09-23** — README's example and coverage table show flow 01 asserting the
  seeded PR `#482`; the real flow 01 is order-independent and only checks the
  redirect to `/pulls` plus the "Pull Requests" heading — `#482` is asserted in
  02. Evidence: `README.md:21,96`, `specs/01-app-boot.flow.json`.

## Session notes

- **2026-09-23** — Findings-by-severity implementation: +1 (Tool & library notes)

## Open questions
