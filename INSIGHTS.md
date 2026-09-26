# Insights — cross-package

Findings that span more than one package, or belong to the repo itself (CI,
Docker, root scripts, the vendored `@devdigest/shared` contracts).
Anything scoped to a single package goes in that package's `INSIGHTS.md`.

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into **every** session in this repo, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

> **Consolidated 2026-09-22, -23, -24 and -26** with the user's approval; settled
> knowledge moved to docs and the `.claude/*/README.md` files, no finding dropped.
> Prior text: `git show 438513f:INSIGHTS.md` (to -24), `git show 79836e0:INSIGHTS.md` (to -26).

## What Works

- 2026-09-23 — The course author's own implementation of each lesson is in this
  repo's history, REVERTED (`c6af1e4` rolled back `641b637`), so it is
  unreachable from `main` → before designing a lesson feature run
  `git log --all --grep '<feature>'` (or `--diff-filter=D`): its commit message
  and `docs/specs/*.md` name the traps. It will not cherry-pick (different base).
  Tell the user when you use it: it is someone else's homework.

- 2026-09-19 — A drizzle migration can be added WITHOUT `pnpm db:generate`, and
  hand-writing it is safer (no unrelated schema drift) → follow
  [docs/hand-written-migrations.md](docs/hand-written-migrations.md) (proven on 0011, 0012).

## What Doesn't Work

- 2026-09-26 — `main` is frozen at the revert `c6af1e4`, so a `lessons/*` branch
  diffed against it carries EVERY lesson so far: a full `/pr-self-review` of
  `lessons/l03-homework` was 353 files → 13 reviewer chunks, ~1.75M sub-agent
  tokens and ~1 h, 3× the budget in the skill's SKILL.md → tell the user the file count
  and that cost BEFORE fanning out, and offer a narrower base. (ref:
  .claude/skills/pr-self-review/SKILL.md § 4 Cost)

- 2026-09-26 — Group E's content trigger (`process.env`, `exec(` in added lines)
  also matches skill/docs `.md` prose and `server/test` env setup; routed to E
  alone and then skipped as noise, 14 files went unreviewed until caught →
  a content-only E match must ALSO keep its F route. (ref:
  .claude/skills/pr-self-review/routing.md:32)

- 2026-09-26 — A VALUE import from `@devdigest/shared` in `client/` breaks the
  Next.js build while typecheck and vitest stay green: the vendored `index.ts`
  re-exports `./contracts/*.js`, which webpack cannot resolve to `.ts`. In
  `next dev` every page compiled after it then 500s, which looks like cache
  corruption → in `client/` use `import type` only and keep runtime constants
  local; the server may import values. (ref: client/src/vendor/shared/index.ts:17)

- 2026-09-24 — Writing a markdown file through a Bash heredoc (or `python3 - <<EOF`)
  gets DENIED by the pr-self-review gate whenever the prose merely mentions a
  push, e.g. a table cell quoting the command: the gate regex-tests the whole
  command string before anything else, heredoc body included, and here reported
  a stale report instead of the real cause → write file content with the
  Write/Edit tools; keep Bash for commands. (ref: .claude/hooks/pr-self-review-gate.mjs)

- 2026-09-21 — A `PreToolUse` hook that exits non-zero FAILS OPEN → every hook answers
  what it cannot handle with `{"permissionDecision":"ask"}` + exit 0
  (`.claude/hooks/README.md` § The `node` resolution problem).

- 2026-09-20 — Do NOT create a `CLAUDE.md` or `CLAUDE.local.md` here: the default
  `instructionFiles` mode (`claude-md-or-agents-md`) drops EVERY `AGENTS.md` the
  moment the project has a `CLAUDE.md` of its own, and the engine counts
  `CLAUDE.md`, `.claude/CLAUDE.md` AND `CLAUDE.local.md` as that — so one
  developer's untracked `CLAUDE.local.md` silently strips the root plus all four
  package instruction files, with no warning. The settings meant to keep both
  are NO-OPs on 2.1.278. (ref: .claude/settings.json:2)

- 2026-09-19 — A Zod schema in `*/src/vendor/shared/contracts/` does NOT imply a
  route serves it: `AgentColumn.cost_usd`, `MultiAgentRun.total_cost_usd` and
  `AgentStats` (contracts/observability.ts:46,82,108) plus `AgentPerfRow` /
  `AgentPerf.summary` (contracts/productionize.ts:152,177) have no server
  implementation at all — grepping their names hits only the contract file →
  before building UI or estimating work against a shared contract, confirm a
  registered route in `server/src/modules/` actually returns it.
  (ref: server/src/vendor/shared/contracts/observability.ts:46)

## Codebase Patterns

- 2026-09-19 / 2026-09-22 — Cost: read the stored `agent_runs.cost_usd` (never
  re-derive it), and NULL means "unknown", not 0 — a plain `SUM(cost_usd)`
  understates → `server/specs/L01-run-cost.md` (§ Null semantics, why it is stored).

## Tool & Library Notes

- 2026-09-26 — The Bash tool's shell is **zsh**: an unquoted `$var` is NOT
  word-split, so `sh $rest` with `rest="guard.sh read-only"` runs a file named
  `guard.sh read-only`, gets no output, and a hook comparison read every case as
  "allow" → run such loops under `bash -c '…'`, or quote each argument separately.

- 2026-09-20 — `grep` here is **ugrep**: a BRE backreference dies with a non-zero
  exit that reads like a passing check → no backreferences
  (`.claude/skills/pr-self-review/greps.md`).

See also — settled recipes, one line each:
- Testing a hook end to end → `.claude/hooks/README.md` § Testing a hook end to end.
- A FRESH headless session (`"$CLAUDE_CODE_EXECPATH" -p`) → `.claude/agents/README.md` § Changing an agent.
- Authoring a skill (PyYAML, `skills-lock.json`) → `.claude/skills/README.md` § Authoring a skill in this repo.

## Recurring Errors & Fixes

- 2026-09-26 — Hook tests that could NOT fail, three in one day: `test-gate.sh`
  cases 1–4 asserted silence against a PASSING report (silent either way), and
  its `run()` builds JSON with `printf '%s'`, so a command holding `"` becomes
  unparseable input the hook answers with silence — an `expect_silent` case passes
  vacuously → assert silence only against a FAILING report, write `"` as `\"` in
  `run '…'` (or build the JSON in a quoted heredoc), and prove each new case red
  against `git show HEAD:<hook>` before trusting it. (ref: .claude/hooks/test-gate.sh:72)

- 2026-09-21 — A pattern shipped without being RUN, three times: the ugrep
  backreference (2026-09-20), `frontend-ui-architecture` §15's `fetch(` matching
  `refetch()`, and an e2e flow command form that does not exist (`e2e/INSIGHTS.md`
  2026-09-22) → treat every §-numbered "Enforcement" section and new flow as
  untested code: run it, and ship its EXPECTED output beside it (known benign
  hits: `.claude/skills/pr-self-review/greps.md` § The patterns).

## Session Notes

- 2026-09-26 — First full `/pr-self-review` of l03-homework (1 CRITICAL, 32 W,
  24 S) and fixes for batches 1–4, incl. gate bypasses and guard false denials.
- 2026-09-26 — L03 Smart Order: `GET /pulls/:id/smart-diff` + 5-role grouping and
  inline finding markers on Files changed (spec: server/specs/L03-smart-diff.md).
- 2026-09-24 — L02 subagents: test-writer, plan-verifier, architecture-reviewer,
  doc-writer + `agent-scope-guard.sh`; tests moved from implementer to test-writer
  (design and sources: .claude/agents/README.md).
- 2026-09-19 → 23 — L01 run-cost, L02 skills + conventions (specs:
  `server/specs/L0{1,2}-*.md`) and the `pr-self-review` / `frontend-ui-architecture`
  skills (design: each skill's `README.md`, `docs/pr-self-review.md`).

## Open Questions
