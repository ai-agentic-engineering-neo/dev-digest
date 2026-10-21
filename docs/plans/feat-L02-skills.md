# Plan: four pipeline subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer) · branch feat/L02-skills

Design-system task: no

> Produced by the `planner` agent on 2026-09-30, saved by the main session.
> Executed by the **main session**, not `implementer`: every file is under
> `.claude/`, which `implementer-protected-paths.sh` refuses. No package code
> changes, so no package checks, `lint:arch` or insights wrap-up apply; the hook
> test suite (row 1) is the test suite.

## Decisions (user, 2026-09-30)

- D1 Plan saved here (`docs/plans/feat-L02-skills.md`).
- D2 Fix `..` traversal in `implementer-protected-paths.sh` in this change (row 13).
- D3 doc-writer does **not** edit `AGENTS.md`; it proposes the "Read when relevant" line in its report.
- D4 test-writer may edit all of `e2e/README.md` (a path hook cannot scope to the coverage table).

## Goal & acceptance criteria

- [ ] AC1 Four agent files exist: `.claude/agents/{test-writer,architecture-reviewer,plan-verifier,doc-writer}.md`, each with frontmatter (name, description, tools, model, maxTurns, skills where given, hooks), a gate, method, stop conditions, hard rules and a report format — verified by `/agents` in a new session and reading each file against this plan.
- [ ] AC2 test-writer `Edit`/`Write` is limited to test paths; refused on source, mocks, config, vendor, `..` traversal and paths outside the repo — verified by `run.sh test-writer-paths`.
- [ ] AC3 test-writer Bash may run package tests/typecheck/lint, `e2e:hermetic`, `insight.sh add`; may not commit, shell-write files, change dependencies, run `db:generate|db:migrate|db:seed`, `vitest -u` or `--fix` — verified by `run.sh test-writer-bash-guard`.
- [ ] AC4 architecture-reviewer has no write tools; Bash runs `pnpm -C server lint:arch` and `check-arch.sh [--all]` (optional `PATH=<nvm node22 bin>:$PATH` prefix, no chaining), `changed-files.sh base|list|diff`, `route.sh`, read-only git, `insight.sh` reads; `--baseline`, `lint:arch:baseline`, operators and other PATH values blocked — verified by `run.sh reviewer-bash-allowlist.arch`.
- [ ] AC5 plan-verifier has no write tools and no `Skill`; report has per-AC and per-row verdicts with evidence, a scope-creep list, a missing list, and no suggestions section — verified by `run.sh reviewer-bash-allowlist.verify` and a dogfood run against this plan.
- [ ] AC6 doc-writer writes only `.md` on documentation paths; `AGENTS.md`, `CLAUDE.md`, `INSIGHTS.md`, `TESTING.md`, `docs/plans/`, `e2e/specs/`, vendor, `.claude/` and non-`.md` refused; placement convention written in the agent file — verified by `run.sh doc-writer-paths`.
- [ ] AC7 `.claude/agents/README.md` shows the new pipeline, four new agent rows with a `Sources` column, the new hooks, and sources for the new agents; stays a map — verified by reading.
- [ ] AC8 Existing agents (`researcher.md`, `planner.md`, `implementer.md`) and hooks (`researcher-git-readonly.sh`, `planner-readonly.sh`, `implementer-bash-guard.sh`) are unchanged; `implementer-protected-paths.sh` changes only by the `..` fix (D2) — verified by `sha256sum` before/after and `run.sh implementer-protected-paths`.

## Out of scope

- A security-reviewer agent (slot kept in the pipeline; use `/security-review` or the `pr-self-review` security lane meanwhile).
- Changes to `planner.md`, `implementer.md`, `researcher.md`, `researcher-git-readonly.sh`, `planner-readonly.sh`, `implementer-bash-guard.sh`.
- New `routing.md` / `route.sh` rows for `server/test/**`, `reviewer-core/test/**`, `e2e/specs/**`.
- A Mermaid render check for doc-writer.

## Relevant INSIGHTS

- `client/INSIGHTS.md:20` — the `pr-self-review` gate greps every Bash command for the literal push / PR-create tokens → hook test inputs live in TSV files the runner reads, never inline.
- `server/INSIGHTS.md:18` — contract copies already differ on `upstream/main` in four files → architecture-reviewer: drift is critical only in touched files.
- `server/INSIGHTS.md:46` — `depcruise --ignore-known` without the baseline file cruises nothing → reviewer runs only `pnpm -C server lint:arch` or `check-arch.sh`.
- `e2e/INSIGHTS.md:25` — `e2e/specs/` holds flow JSON, not feature specs → doc-writer never writes there; `flows.md` belongs to test-writer.
- `e2e/INSIGHTS.md:13` — flows flake under CPU load → test-writer re-runs a failing flow once.
- `server/INSIGHTS.md:11` — `ContainerOverrides` + `adapters/mocks.ts` keep unit tests hermetic → test-writer reuses mocks, never edits `mocks.ts`.

## Architecture constraints

| Rule / limit | Applies to | How the plan complies |
|---|---|---|
| `.claude/` off-limits to implementer | all rows | main session creates the files |
| Parent permission mode overrides the agent's | all 4 agents | every write/Bash tool has a PreToolUse hook; reviewers have no Edit/Write |
| No sub-agents; no `AskUserQuestion` in subagents | all 4 | no `Agent` tool; questions returned in the report |
| `skills:` preload injects whole skills | frontmatter | arch-reviewer preloads the two architecture skills, doc-writer `mermaid-diagram`, others none |
| Do-not-touch list (root `AGENTS.md`) | path hooks | allowlists, deny by default |
| lint:arch baseline never grows | reviewer allowlist | `--baseline`, `lint:arch:baseline` blocked; growth reported as critical |
| Severity scale `pr-self-review/reference/severity.md` | architecture-reviewer | reused as-is |

## Work breakdown (ordered)

| # | File (new/edit) | Change | Test |
|---|---|---|---|
| 0 | — | `sha256sum` of existing agents and hooks | AC8 |
| 1 | `.claude/hooks/tests/run.sh` (new) | TSV-driven hook test runner | runs itself |
| 2 | `.claude/hooks/tests/cases/{test-writer-paths,test-writer-bash-guard,reviewer-bash-allowlist.arch,reviewer-bash-allowlist.verify,doc-writer-paths,implementer-protected-paths}.tsv` (new) | cases; red before rows 3–6, 13 | — |
| 3 | `.claude/hooks/test-writer-paths.sh` (new) | Edit/Write allowlist, `realpath -m` normalised | row 2 |
| 4 | `.claude/hooks/test-writer-bash-guard.sh` (new) | delegates to `implementer-bash-guard.sh`, then bans shell writes (insight.sh exempt only without shell operators), dep changes, db scripts, `-u`, `--fix` | row 2 |
| 5 | `.claude/hooks/reviewer-bash-allowlist.sh` (new, arg `arch`\|`verify`) | strict allowlist; remainder delegates to `planner-readonly.sh` | row 2 |
| 6 | `.claude/hooks/doc-writer-paths.sh` (new) | `.md`-only docs allowlist, normalised | row 2 |
| 7 | — | doc-writer Bash reuses `planner-readonly.sh` unchanged | existing |
| 8 | `.claude/agents/test-writer.md` (new) | sonnet; test files only; per-package skill table; runs after implementer as an optional coverage pass | smoke |
| 9 | `.claude/agents/architecture-reviewer.md` (new) | opus; read-only; preloads onion + react-frontend-architecture; deterministic checks first | smoke |
| 10 | `.claude/agents/plan-verifier.md` (new) | sonnet; read-only; no Skill; plan-only verdicts | dogfood on this plan |
| 11 | `.claude/agents/doc-writer.md` (new) | sonnet; docs `.md` only; preloads mermaid-diagram; placement convention | smoke |
| 12 | `.claude/agents/README.md` (edit) | pipeline, rows, hooks, sources | read |
| 13 | `.claude/hooks/implementer-protected-paths.sh` (edit, D2) | normalise path with `realpath -m` before matching | row 2 |

## Contracts & migrations

- Contract changes: none. Migration: none.

## Verification plan

| Scope | Commands | Needs Docker |
|---|---|---|
| hooks | `bash /home/iryna/Dev/dev-digest/.claude/hooks/tests/run.sh` (all green); `bash -n` on each new script | no |
| agents | new session / `/agents` lists the four with the right model and tools; smoke: test-writer blocked on `server/src/app.ts`, architecture-reviewer report quotes real `lint:arch` output, plan-verifier on this plan, doc-writer blocked on `server/AGENTS.md` | no |
| AC8 | `sha256sum` before/after | no |

## Risks & open questions

- Existing agents and hooks are untracked; commit them so the change is reviewable.
- `route.sh` gives test files only `typescript-expert`, `security`; test-writer uses its own per-package skill table.
- Reviewer allowlist pins `node/v22*`; after a Node upgrade the hook regex must follow.
- "Read-only" reviewers running vitest/tsc may write git-ignored caches; plan-verifier running it-tests starts testcontainers. Accepted.
- Two verifier sources (V&V, RTM) were seen only as search summaries.

## Handoff to reviewers

- Architecture: agent tools match hooks; no Edit/Write on reviewers; no `Agent` tool anywhere.
- Security: allowlist bypasses (operators, `PATH=` to another dir, `pnpm -C ../x`, `--outputFile`, `..`/absolute paths), jq on missing fields, delegated hooks' non-2 exits treated as block, insight.sh exemption not carrying other writes.
