# e2e — insights

Non-obvious lessons learned while working in `e2e/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — Text locators depend on strings owned by other packages, and no test there warns you. PR-tab labels "Agent runs"/"Files changed" are hard-coded JSX (not i18n), and their keys `findings`/`diff` are what `wait --url tab=…` checks. "Pull Requests"/"API Keys"/"Feature Models" come from `client/messages/en/*.json`. PR/finding/agent names come from `server/src/db/seed.ts` → before renaming any UI text, tab key or seed row, grep `e2e/specs/` for it (client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:117 → PrDetailHeader tabs).
- 2026-11-04 — A failing `assert.stdoutIncludes` check `break`s the flow **without** a screenshot. Only a thrown step (non-zero exit or timeout) writes `test-results/<id>-fail.png` → prefer `wait --text` over `stdoutIncludes` when you want a CI artifact for failures (run.ts:73 → runFlow).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — On Windows Git Bash, `pgrep` and `lsof` don't exist (checked with `command -v`). `scripts/e2e.sh` swallows the errors with `|| true`, so `kill_tree` kills only the top PID, and the grandchild `tsx`/`next dev` processes keep :3101/:3100 bound after the run → on Windows, free the ports by hand (`netstat -ano | findstr :3100` → `taskkill /PID <pid> /T /F`) before re-running (scripts/e2e.sh:60 → kill_tree).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-04 — On Windows the hermetic runner seeds nothing: `e2e.sh` calls `pnpm db:migrate`/`db:seed`, whose CLI guard (`import.meta.url === \`file://${process.argv[1]}\``) never matches a Windows path. They exit 0 silently, the API boots on an empty DB, and flow 01 fails at `wait --url /pulls` (the root shows the empty state, no redirect) → apply the server INSIGHTS workaround (temp `.mts` that awaits `runMigrations` + `seed`) against :5433, or run in WSL/CI (scripts/e2e.sh:126 → migrate step; server/src/db/migrate.ts:37 → CLI entrypoint).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Knowledge-file pass: wrote docs/how-flows-work.md, docs/writing-a-flow.md, specs/README.md (flow index) from reading run.ts, flows, scripts/e2e.sh.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — Unverified (agent-browser isn't installed on this box): `run.ts` spawns `execFile(BIN, args)` without `shell: true`. On Windows, `npm i -g` installs an `agent-browser.cmd` shim, and recent Node refuses to spawn `.cmd` files without a shell, so every step may fail with a spawn error → if that happens, point `AGENT_BROWSER_BIN` at the real `.exe` or add `shell: true` on win32 (run.ts:44 → ab).
