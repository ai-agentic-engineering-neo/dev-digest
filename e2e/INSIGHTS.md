# Insights — e2e

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-09-22 — Running `npx tsx run.ts` against the DEV stack on :3000 fails
  flows 02/04/05 for reasons that have nothing to do with the code under test:
  a second repo added by hand sorts ahead of `acme/payments-api`, so the home
  redirect lands on the wrong repo and PR #482 is simply not on the page; and
  the PR list's status is DERIVED (`pulls/status.ts:144`), so the seeded review
  makes #482 `reviewed` and the default "Needs review" tab shows "No pull
  requests" → always run `bash scripts/e2e.sh`, whose ephemeral Postgres on
  :5433 guarantees the seeded repo is the only one; a mass failure on the dev
  stack is not evidence of a regression. (ref: scripts/e2e.sh:11)

- 2026-09-19 — `server/src/db/seed.ts` inserts NO `agent_runs` rows (it seeds
  workspaces, users, settings, repos, pulls, files, commits, reviews, findings
  and agents only), so every run-derived surface — run history, duration,
  tokens, cost, the PR list's run aggregates — is empty on a fresh seed → assert
  a column or section HEADER (`wait --text "Cost"`), never a value; a value
  assertion either fails or, worse, passes only against a dirty local DB.
  (ref: server/src/db/seed.ts:39-220)

## Codebase Patterns

## Tool & Library Notes

- 2026-09-19 — `agent-browser` is an external, globally-installed binary, NOT a
  dependency in `package.json`, so on a machine without it `./scripts/e2e.sh`
  brings the whole stack up, prints `0/7 flows passed` with every step failing
  `spawn agent-browser ENOENT`, and still **exits 0** — which reads exactly like
  "I broke all seven flows" → check `command -v agent-browser` before believing
  a mass failure (the script only `warn`s about it, near the top of its output,
  far from the summary); install once with `npm i -g agent-browser &&
  agent-browser install`, and meanwhile verify flow edits with `npm run
  typecheck` plus a JSON parse. (ref: scripts/e2e.sh:51)
  - 2026-09-22 — Correction: the flows CAN be run on a machine without the
    binary, and without touching a lock file. `npx -y agent-browser@latest`
    fetches it into the npm cache (0.38.1 here), and `run.ts` already honours
    `AGENT_BROWSER_BIN` — but it `spawn`s the value as one argv[0], so a bare
    `npx` string will not do; point it at a one-line shim:
    `printf '#!/bin/sh\nexec npx -y agent-browser@latest "$@"\n' > /tmp/ab-shim.sh
    && chmod +x /tmp/ab-shim.sh`, then
    `AGENT_BROWSER_BIN=/tmp/ab-shim.sh bash scripts/e2e.sh`. So an unexecuted
    flow is now a choice, not a constraint. (ref: e2e/run.ts:40)

- 2026-09-19 — The command vocabulary has no HOVER verb (`open`, `wait
  --url|--text|--load`, `find role|text|label … click`), and no negative text
  assertion either → a hover-only surface such as the PR list's findings popover
  cannot be covered here at all; assert its trigger's neighbouring column header
  instead and keep the behaviour in a vitest test, and say so in the flow's
  `label` so the gap is visible to the next reader. (ref: e2e/README.md)

## Recurring Errors & Fixes

- 2026-09-22 — Third instance of "a shipped pattern must be RUN before it goes
  into a file" (the 2026-09-20 ugrep and 2026-09-21 `refetch(` entries were the
  first two): a new flow written from the other specs used
  `["click", "--text", "pr-quality-rubric"]`, but `click` takes a CSS SELECTOR —
  there is no `--text` flag, and the by-text forms are
  `["find","text",<t>,"click"]` and `["find","role","button","click","--name",<n>]`.
  A JSON parse and `pnpm typecheck` both pass on the broken spec because a flow
  is opaque data, so nothing catches it until the browser runs → execute every
  new flow (see the npx shim above) before committing it. (ref: e2e/specs/08-skills.flow.json)

## Session Notes

- 2026-09-22 — L02 skills: added flow 08 (skills list → Config/Preview/Versions
  → the agent editor's Skills tab), executed hermetically — 23/23 steps pass.

- 2026-09-19 — L01-b findings visibility: extended flows 02 (findings column
  header) and 04 (severity counter pills + filter toggle); both unexecuted here
  because `agent-browser` is not installed on this machine.

## Open Questions

- 2026-09-22 — Why does flow 02's `wait --text "Cost"` fail on a HERMETIC fresh
  stack (reproducible, twice), when the step before it — the PR title on the
  same page — passes, and `COLUMN_KEYS` in
  `client/src/app/repos/[repoId]/pulls/constants.ts:46` renders that header
  unconditionally? Suspect the 8-column grid overflows the headless viewport and
  the column is clipped, making the text present but not visible. This predates
  the L02 branch (the flow and the header source last changed in `c8be044` /
  `4146608`) and is the only failure in an otherwise 7/8 hermetic run.
  - 2026-09-26 — Answered: not clipping. The PR list header row has
    `textTransform: "uppercase"` (`client/src/app/repos/[repoId]/pulls/styles.ts:106`)
    and `wait --text` matches the RENDERED text, so "Cost" never appears — only
    "COST". Switching to `COST` passed that step and the next one then failed the
    same way on "Findings" → assert CSS-transformed text in its displayed case
    (`COST`, `FINDINGS`); flow 02 now passes, suite 8/8 hermetic.
    (ref: e2e/specs/02-repo-pulls-detail.flow.json:8-9)
