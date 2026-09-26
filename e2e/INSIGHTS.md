# e2e — INSIGHTS

Append-only engineering insights for `e2e/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] The hermetic runner starts an ephemeral Postgres with no named volume, so every run is empty and seeded fresh; it never touches `devdigest_pgdata`. Evidence: `scripts/e2e.sh:84`.
- [2026-09-25] `wait --text` accepts literal `$` and `·` (e.g. `"9,119 tok · $0.0013"`); the drawer is opened deterministically via `find role button click --name "Open run trace & logs"` (the timeline icon button's aria-label). Evidence: `e2e/specs/08-run-cost.flow.json`.
- [2026-09-25] A flow that passed twice can fail on `find text … click` when a heavy job (the pr-self-review precheck running every package's tests) shares the CPU; the hermetic run went 10/10 as soon as the machine was idle. Re-run before hunting a locator bug. Evidence: `e2e/specs/09-findings-severity.flow.json:open the PR row`.

## What Doesn't Work

- [2026-09-25] Running `npm test` against a dev DB that has more than the seeded repo. Flows 02, 04, 05 follow the home redirect to the first repo and land on the wrong one. Use `npm run e2e:hermetic`. Evidence: `e2e/specs/02-repo-pulls-detail.flow.json:6`.
- [2026-09-25] Resetting the dev DB with `docker compose down -v`. It deletes the volume with every imported repo and review. Evidence: `docker-compose.yml`.
- [2026-09-25] `find text <name> click` on a card that sits below the fold of a page-internal scroll pane (`overflow: auto` main column, e.g. the /skills grid) does not navigate: the click lands outside the viewport. Click an element in the first visible row instead, or scroll first. Evidence: `e2e/specs/10-skills.flow.json:open the first skill card's preview`.
- [2026-09-26] `find role link click --name Conventions` does not find the sidebar nav item although NavItem renders a next/link anchor; `find text Conventions click` does. Prefer text locators for sidebar items. Evidence: `e2e/specs/11-conventions.flow.json`.

## Codebase Patterns

- [2026-09-25] `wait --url` and `wait --text` are the assertions: agent-browser exits non-zero on timeout and the runner fails the step on any non-zero exit. Evidence: `e2e/run.ts:43`.
- [2026-09-25] `specs/` holds flow JSON, not feature specs; it is the one package without a `specs/README.md` placeholder. Evidence: `e2e/specs/`.
- [2026-09-25] Only deterministic locators (`--url`, `--text`, `find role|text|label`); the AI `chat` command is never used, so runs need no key. Evidence: `e2e/run.ts:resolveArgs`.

## Tool & Library Notes

- [2026-09-25] This package uses npm (`package-lock.json`), not pnpm. `agent-browser` is a global CLI, installed once with `npm i -g agent-browser && agent-browser install`. Evidence: `e2e/package.json`.

## Recurring Errors & Fixes

_None yet._

## Session Notes

- [2026-09-25] Initial capture from a read-through of the runner and flows. No code changed. Evidence: `e2e/CLAUDE.md`.
- [2026-09-25] Added 08-run-cost flow; full hermetic run 8/8 green after the seed gained a completed priced run (flow 04's '2 findings' text now matches twice, which wait --text tolerates). Evidence: `e2e/README.md:coverage table`.
- [2026-09-25] HW1 criteria pass: added 09-findings-severity (pills, Accept/Reject, Warning filter round-trip); hermetic run 9/9 green; docs/runner.md + specs/flows.md written by a subagent and extended for flow 09. Evidence: `e2e/specs/09-findings-severity.flow.json`.
- [2026-09-25] L02: added 10-skills flow (skills grid → side preview → agent Skills tab); locators had to move to the first visible card and to `find role button --name Skills`; hermetic run 10/10 green. Evidence: `e2e/specs/10-skills.flow.json`.
- [2026-09-26] HW2: flow 10 extended to the side panel (?skill=) and the /skills/:id Versioning tab; flow 11 covers /conventions on the seeded (uncloned) repo. Evidence: `e2e/specs/flows.md:11-conventions`.

## Open Questions

- [2026-09-25] Should flows 02, 04, 05 open the seeded repo by id from GET /repos instead of trusting the home redirect, so they also pass against a dev DB with extra repos? Evidence: `e2e/specs/02-repo-pulls-detail.flow.json:6`.

