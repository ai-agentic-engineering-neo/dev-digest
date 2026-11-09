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
- 2026-11-05 — CI e2e builds the DB from zero (migrate, THEN seed), so a data back-fill inside a migration (0013 `UPDATE skill_versions SET note = 'Initial version'`) never touches seed rows; a flow waiting for that text passed locally (old seeded DB) and timed out in CI → put such defaults in the seed / insert path itself, not only in the migration (../server/src/db/seed.ts:290 → versionNote(null, true)).
- 2026-11-05 — CI's agent-browser viewport is 1280×577, so a card far down a scrollable list (alphabetical `/skills`: `untested-branches` is near the end) is below the fold and `find text … click` fails although it passes on a tall local screen → filter first (`find placeholder "Search skills…" fill <name>`), then click; when CI fails, download the `e2e-failure` artifact (`<flow>-fail.png` shows the page at the failing step) (specs/08-skills.flow.json:10).
- 2026-11-05 — `wait --text` matches RENDERED text, so a label styled `text-transform: uppercase` (Skills Stats tiles: "Pull frequency" renders as "PULL FREQUENCY") never matches and the step times out → wait for text that is shown as written (e.g. the stats footer "Runs before run attribution shipped"), never for an uppercased label (specs/08-skills.flow.json:17).
- 2026-11-06 — `find … click` does NOT wait for a navigation started by the previous step: flow 08 clicked "Test Quality Reviewer" and immediately ran `find role button --name Skills`, which failed fast once a bigger client bundle (Multi-Agent Review PR) made the agent page load slower — it had passed only by timing luck → after every click that navigates, add `wait --url <new path>` + `wait --load networkidle` before the next `find`, as flows 02/04/05 do (specs/08-skills.flow.json:23 → agent editor route reached).
- 2026-11-06 — On Windows `npm run e2e:hermetic` dies instantly with "'..' is not recognized as an internal or external command" (npm runs scripts via cmd.exe, which can't exec `../scripts/e2e.sh`); `bash ../scripts/e2e.sh` gets further but still fails here: agent-browser missing, migrate/seed no-op (entry above), and `pnpm` starting web → "Access is denied" → run hermetic e2e in WSL/CI, not native Windows (package.json:10 → e2e:hermetic; ../scripts/e2e.sh → web start).
- 2026-11-07 — CORRECTION of 2026-11-06 Open Question (flow 09 never executed): it ran in CI after PR #23 and turned `e2e web` red on main at `wait --text "Description"` — the `SectionLabel` renders uppercase, the same trap as the 2026-11-05 entry, repeated → a section label is never a `wait --text` target; wait for the seeded content under it (PR body "prevent abuse from unauthenticated clients", ../server/src/db/seed.ts:120) (specs/09-pr-intent.flow.json:14).
- 2026-11-09 — Flow 13 (PR Brief) failed in CI at `wait --text <seeded brief summary>` although seed, schema and UI were correct: the fail screenshot showed EVERY Overview panel in error (verdict, brief, intent, blast). All 12 flows hit the API from one IP within ~21 s, and the API's global rate limit (120/min, active because CI isn't `NODE_ENV=test`) answered the last flow with 429 — each new flow / extra Overview request moves that cliff earlier → the stack runs with `RATE_LIMIT_MAX=2000` (../.github/workflows/e2e-web.yml env, ../scripts/e2e.sh); when several panels fail at once in a late flow, suspect 429 before the feature (../server/src/app.ts:96 → rateLimit max).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Knowledge-file pass: wrote docs/how-flows-work.md, docs/writing-a-flow.md, specs/README.md (flow index) from reading run.ts, flows, scripts/e2e.sh.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — Unverified (agent-browser isn't installed on this box): `run.ts` spawns `execFile(BIN, args)` without `shell: true`. On Windows, `npm i -g` installs an `agent-browser.cmd` shim, and recent Node refuses to spawn `.cmd` files without a shell, so every step may fail with a spawn error → if that happens, point `AGENT_BROWSER_BIN` at the real `.exe` or add `shell: true` on win32 (run.ts:44 → ab).
- 2026-11-05 — `specs/08-skills.flow.json` was written but never executed (agent-browser not installed) — the Skills tab is a Kit `Tabs` button, located via `find role button --name Skills`; run it with `npm run e2e:hermetic` and fix locators if a step times out (specs/08-skills.flow.json).
- 2026-11-06 — `specs/09-pr-intent.flow.json` was written but never executed (hermetic stack can't start on this Windows box); its strings were checked statically against client/messages/en/brief.json `intent.empty` and seed PR #482 (no `pr_intent` row seeded) — run it in CI/WSL and fix locators if a step times out (specs/09-pr-intent.flow.json).
- 2026-11-08 — `specs/12-project-context.flow.json` was written but never executed (no agent-browser / hermetic stack on this Windows box). Unverified assumption: the run-trace drawer is a full-screen fixed overlay with no Escape handler, so the flow re-opens `{BASE}/` before clicking the sidebar "Project Context" link; also unverified that `wait --text "Project context"` doesn't match the sidebar "Project Context" label first (the doc paths after it are the real assertions) → run it in CI/WSL and fix locators if a step times out (specs/12-project-context.flow.json:13 → reopen step; ../server/src/db/seed.ts → seedReviewRun).
