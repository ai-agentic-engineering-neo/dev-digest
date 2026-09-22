# Rubrics — what goes where, and what is worth writing

## Contents
- Sections (the 7 fixed rubrics)
- Qualifies / does not qualify
- Good vs bad entries
- Package routing edge cases

## Sections

| Section | Write here when… | Shape |
|---|---|---|
| **What Works** | an approach solved a real problem here after other attempts, and will apply again | `<where>: <approach> → use when <situation>` |
| **What Doesn't Work** | an approach failed or was abandoned — incl. what the agent keeps reaching for wrongly. Most valuable section: never skip it | `<where>: <approach> fails because <cause> → do <instead>` |
| **Codebase Patterns** | a convention/decision the code relies on but doesn't state (decided this session, or discovered) | `<where>: <rule> — <why>` |
| **Tool & Library Notes** | a dependency quirk: version, flag, limit, default | `<lib@version>: <quirk> → <workaround>` |
| **Recurring Errors & Fixes** | an error seen more than once, or certain to recur | `` `<error text>` in <where> → cause: <x> → fix: <y> `` |
| **Session Notes** | a session produced at least one other entry or a lasting decision | `<what changed>; left: <what's open>` |
| **Open Questions** | suspected but unverified, or deliberately left unresolved | `<question> — seen in <where>` |

## Qualifies (all must hold)
- **Counterfactual:** if this entry vanished, would the next agent — even after reading the code, tests, README and AGENTS.md — likely repeat the mistake or redo the investigation? (Every `ce-compound`)
- **Recurs:** project-specific and will matter again; not a one-off typo. (evoleinik)
- **Worth it:** saves 5+ minutes or prevents a wrong turn. (evoleinik)
- **Verified:** observed this session — ran, failed, measured, fix confirmed working. Otherwise → Open Questions. (evoleinik, learning-loop)

## Does not qualify
- Generic programming knowledge ("await inside loops is slow").
- Anything already in `README.md`, `docs/`, `AGENTS.md`, or obvious from the code.
- Effort, diff size or "task finished" by themselves. (Every `ce-compound`)
- Fixes whose code/test already makes the lesson obvious.
- Anything needing a paragraph — that's documentation: write `<package>/docs/<topic>.md`, then add a one-line entry pointing to it.

## Good vs bad

Bad → why:
- `- async is tricky in the executor` → no where, no what, no action.
- `- fixed the flaky test` → one-off; the fix is in the code.
- `- Zod validates input` → generic knowledge.

Good (real facts from this repo):
- `- 2026-09-21 — client/src/vendor/shared: a copy of server's contracts, already drifted in 5 files → change a contract in both copies`
- `- 2026-09-21 — e2e: npm test against the dev DB fails flows 02/04/05 when >1 repo exists → run ./scripts/e2e.sh`

## Package routing
- `server/**`, incl. `server/src/modules/repo-intel` → `server`
- `client/**` → `client` · `reviewer-core/**` → `reviewer-core` · `e2e/**` → `e2e`
- `scripts/`, `.github/`, `docker-compose.yml` → the package whose workflow it serves (dev.sh → server; e2e.sh → e2e)
- Two packages interact → the package where the next agent will hit the problem. Never copy one entry into two files.
