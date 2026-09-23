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

- **2026-09-23** — The seed writes PR #482's review and findings only when it creates the PR, so deleting the seeded review (the accordion's trash icon) is permanent for that DB — `pnpm db:seed` won't bring it back and flow 04 then fails → never delete it in a DB you run flows against; the hermetic stack always starts empty. Evidence: `../server/src/db/seed.ts:99`.

## Tool & library notes

- **2026-09-23** — Flows fail with `spawn agent-browser ENOENT` without the global
  CLI. Instead of `npm i -g agent-browser && agent-browser install`, which downloads
  Chrome for Testing, point the runner at any install and at the system Chrome:
  `AGENT_BROWSER_BIN=<path>/agent-browser
  AGENT_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  npm run e2e:hermetic` → 7/7 passed. Evidence: `run.ts:40`, `README.md:52-53`.

## Recurring errors & fixes

- **2026-09-23** — `scripts/e2e.sh` installs deps only for `server/`, `client/` and `reviewer-core/`, then runs `npm test` in `e2e/` → on a fresh clone run `cd e2e && npm install` first or the runner can't start (`tsx` missing). Evidence: `../scripts/e2e.sh:106-117,163`.

## Doc drift

- **2026-09-23** — README's example and coverage table show flow 01 asserting the
  seeded PR `#482`; the real flow 01 is order-independent and only checks the
  redirect to `/pulls` plus the "Pull Requests" heading — `#482` is asserted in
  02. Evidence: `README.md:21,96`, `specs/01-app-boot.flow.json`.
- **2026-09-23** — `CLAUDE.md` says "read stderr" for a failing step, but `run.ts` prints only the first line of the thrown error and drops the rest of agent-browser's output → to see it all, rerun the failing command by hand (`agent-browser wait --text …`) against a live stack. Evidence: `run.ts:81`, `CLAUDE.md:40`.
- **2026-09-23** — README's coverage row for flow 04 says "expand → FindingCard", but the flow never expands: it relies on the newest review run being open by default. Evidence: `README.md:99`, `../client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:175`.

## Session notes

- **2026-09-23** — Findings-by-severity implementation: +1 (Tool & library notes)
- **2026-09-23** — HW1 fixes, block F (docs/hermetic-runner.md, specs/flows.md): +4 (Doc drift ×2, Recurring errors & fixes, Codebase patterns)

## Open questions
