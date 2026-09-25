# e2e — INSIGHTS

Append-only engineering insights for `e2e/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] The hermetic runner starts an ephemeral Postgres with no named volume, so every run is empty and seeded fresh; it never touches `devdigest_pgdata`. Evidence: `scripts/e2e.sh:84`.
- [2026-09-25] `wait --text` accepts literal `$` and `·` (e.g. `"9,119 tok · $0.0013"`); the drawer is opened deterministically via `find role button click --name "Open run trace & logs"` (the timeline icon button's aria-label). Evidence: `e2e/specs/08-run-cost.flow.json`.

## What Doesn't Work

- [2026-09-25] Running `npm test` against a dev DB that has more than the seeded repo. Flows 02, 04, 05 follow the home redirect to the first repo and land on the wrong one. Use `npm run e2e:hermetic`. Evidence: `e2e/specs/02-repo-pulls-detail.flow.json:6`.
- [2026-09-25] Resetting the dev DB with `docker compose down -v`. It deletes the volume with every imported repo and review.

## Codebase Patterns

- [2026-09-25] `wait --url` and `wait --text` are the assertions: agent-browser exits non-zero on timeout and the runner fails the step on any non-zero exit. Evidence: `e2e/run.ts:43`.
- [2026-09-25] `specs/` holds flow JSON, not feature specs; it is the one package without a `specs/README.md` placeholder.
- [2026-09-25] Only deterministic locators (`--url`, `--text`, `find role|text|label`); the AI `chat` command is never used, so runs need no key.

## Tool & Library Notes

- [2026-09-25] This package uses npm (`package-lock.json`), not pnpm. `agent-browser` is a global CLI, installed once with `npm i -g agent-browser && agent-browser install`.

## Recurring Errors & Fixes

_None yet._

## Session Notes

- [2026-09-25] Initial capture from a read-through of the runner and flows. No code changed.
- [2026-09-25] Added 08-run-cost flow; full hermetic run 8/8 green after the seed gained a completed priced run (flow 04's '2 findings' text now matches twice, which wait --text tolerates). Evidence: `e2e/README.md:coverage table`.

## Open Questions

- [2026-09-25] Should flows 02, 04, 05 open the seeded repo by id from GET /repos instead of trusting the home redirect, so they also pass against a dev DB with extra repos? Evidence: `e2e/specs/02-repo-pulls-detail.flow.json:6`.

