# e2e — learnings

Lessons captured while working in this module, written by the
`engineering-insights` skill. Append-only: add entries, never rewrite or delete
them; correct an entry by appending a new dated one that names it. Curated
facts about the module, where the module keeps them, are in `INSIGHTS.md`.

Entry format:
`- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-21 — `scripts/e2e.sh` exits 0 even when no flow ran: with `e2e/node_modules` missing it prints `tsx: command not found` and still reports success. Before trusting a green run, check its output for the flow results; run `cd e2e && npm ci` and install `agent-browser` (`npm i -g agent-browser && agent-browser install`) first. Evidence: scripts/e2e.sh:163

- 2026-11-21 — `scripts/e2e.sh` is NOT safe alongside a running dev stack despite its header: it starts `next dev -p 3100` in the same `client/` folder, which rewrites the shared `client/.next` and breaks the dev server on :3000 (`Loading chunk app/... failed`, chunk 404). Stop the dev web server first, or after the run fix it with Ctrl-C → `rm -rf client/.next && pnpm dev`. Evidence: scripts/e2e.sh:148

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

- 2026-11-21 — The runner loads only files ending in `.flow.json` from `specs/`, so markdown specs can live in the same folder; a flow saved under any other extension is silently never run. Evidence: e2e/run.ts:55

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

## Decisions

<!-- A decision and the reason for it. -->

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and written-spec files beside the flows; no flow or runner code changed.

- 2026-11-21 — Added a `$0.014` COST assertion to 02-repo-pulls-detail.flow.json (M1 cost badge); not executed locally because agent-browser is not installed.

- 2026-11-22 — Added a `1 CRITICAL` counter assertion to 04-pr-findings.flow.json (M1 severity filter); not executed locally because agent-browser is not installed.

## Open Questions

<!-- What is still unresolved. -->
