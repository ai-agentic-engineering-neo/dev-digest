# Insights — e2e

Non-obvious lessons from working in this package, captured by the `engineering-insights` skill.
Read before a non-trivial change and treat as high-confidence guidance unless told otherwise.
Append-only: add a bullet at the end of a section, never rewrite old ones — a newer entry marks
itself `(supersedes YYYY-MM-DD entry)`. Humans prune periodically.

Entry (every bullet, incl. Session Notes / Open Questions — date AND `path:line` are mandatory):
`- **YYYY-MM-DD** · <what is true> → <what to do> · \`path/from/repo-root.ts:42\``

## What Works
- **2026-09-17** · No global `agent-browser` needed: `npm i agent-browser` into any temp dir, then `AGENT_BROWSER_BIN=<dir>/node_modules/.bin/agent-browser npm test` (system Chrome is picked up); `find label "<aria-label>" hover` drives hover popovers · `e2e/run.ts:40`

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes
- **2026-09-17** · Against a long-lived dev DB, flow 02 fails at `wait --text $0.014` and flows 04/05 at `find text "Add rate limiting…" click`; the old seed also has no agent run and a review with `run_id: null`, so timeline steps can't pass → these need a freshly-seeded DB (`./scripts/e2e.sh`), not a code fix · `e2e/specs/04-pr-findings.flow.json:12`

## Session Notes
- **2026-09-16** · Run cost feature: extended flows 02 and 04 with cost text waits; added 1 Open Question · `e2e/specs/02-repo-pulls-detail.flow.json:8`
- **2026-09-17** · Findings by severity: added hover-popover steps to flows 02/04 and pill filter steps to 04; ran the suite on the dev stack (4/7, stale-DB failures); added 2 entries + 1 Open Question · `e2e/specs/04-pr-findings.flow.json:16`
- **2026-09-17** · ESLint 9 flat config + `lint` script; one-off normalization of entries to `path:line` format; no new entries · `e2e/eslint.config.mjs:1`
- **2026-09-20** · Created `docs/{README,overview,structure,patterns}.md` (states that `specs/` = executable flows, feature specs live in client/server) and the pointer lines in `CLAUDE.md`; no new entries · `e2e/docs/README.md:5`

## Open Questions
- **2026-09-16** · Cost assertions `$0.014` (flow 02) and `9,500 tok · $0.014` (flow 04) were added but never executed — `agent-browser` is not installed locally → run `npm i -g agent-browser && ./scripts/e2e.sh` and confirm both steps pass · `e2e/specs/04-pr-findings.flow.json:12`
- **2026-09-17** · New steps in flow 02 (list popover) and 04 (timeline popover, `1 Warning` pill filter) were verified by driving agent-browser manually on the dev DB, but not as part of a green fresh-seed run; the timeline hover step was never exercised (dev DB has no linked run) → run `./scripts/e2e.sh` and confirm · `e2e/specs/04-pr-findings.flow.json:16`

