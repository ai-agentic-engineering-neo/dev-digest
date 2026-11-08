# Agents — map

Project subagents for Claude Code: one Markdown file per agent (YAML frontmatter + system prompt).
This README is the **map** of the set — who does what, with which rights, from which input to which
output, and where the rules come from. The rules themselves live in the agent files and the linked
skills; don't copy them here.

## Pipeline

```
question ─────────► researcher ─► report (chat)
2+ approaches ────► brainstorm ─► options + recommendation (chat) ─► spec-creator (product) / implementation-planner (technical)

feature request ──► spec-creator ─► spec (WHAT/WHY: SPEC-NN, EARS AC-n; draft)
                      1 module → <module>/specs/<feature>.md · ≥ 2 modules → ONE root specs/<feature>.md
                      research · design sources · blocking questions (≤ 4 q × ≤ 3 rounds) · rest inline [NEEDS CLARIFICATION]
                ──► user sets spec "approved" (no [NEEDS CLARIFICATION] left)
                ──► implementation-planner spec: <paths> ─► plans/<feature>.md (HOW: Covers SPEC-NN/AC-n,
                      Execution mode; draft) — or CANNOT PLAN → back to spec-creator
                ──► user sets plan "approved"
                ──► /implement-plan plans/<feature>.md          (manual skill, main session)
                      per wave, multi-agent: implementer-backend / implementer-frontend × tasks, in parallel
                               single-agent: the main session does the tasks one by one
                      ─► gate: ownership diff · Verify · typecheck · layer check
                      ─► task Status in the plan · insight candidates → engineering-insights
                      Finish: plan-verifier (traceability AC → task → test → commit)
                              + architecture-reviewer + security-reviewer (one message, read-only)
                      ─► COMPLIANT + both PASS → plan done · specs implemented · optional doc-writer
                ──► user runs /pr-self-review ─► push / PR

existing code ────► test-writer ─► test files + report (manual)
plan / spec / code ► doc-writer ─► <pkg>/docs, READMEs + report (manual or offered at Finish)
change set ───────► architecture-reviewer · security-reviewer · plan-verifier ─► report (manual, or /implement-plan Finish)
```

## Where specs live

One feature = ONE spec. It touches one module → `<module>/specs/<feature>.md`; two or more → the root
[`specs/<feature>.md`](../../specs/README.md), with a "see also" line in each touched module's
`specs/README.md`. `SPEC-NN` is unique across `specs/` + every `*/specs/`. `implementation-planner` and
`plan-verifier` find specs in both places (plan `Specs:` / Grep `Spec ID:`). Specs written before
2026-11-08 have no Spec ID and may be split per module (legacy).

## Roles, input, output

| Agent | Responsibility | Input | Output artifacts | Launched by |
|---|---|---|---|---|
| [researcher](researcher.md) | Answer one concrete question from the repo and/or external sources; interview first if the request is vague | a question (free text) | report in chat: TL;DR, findings with `path:line`/URL, references, "Not found / unverified" — or clarifying questions | anyone (`@researcher`, "use the researcher…") |
| [spec-creator](spec-creator.md) | WHAT and WHY: research, design review (user-given files/screenshots/Figma/links first, then `docs/design/**`, specs, plans, docs, code, live system), blocking questions, write the feature spec; only spec files + specs-README index lines — no code, plans, tests, docs | feature request (free text, + `answers:`) | ONE spec: `<module>/specs/<feature>.md` if one module is touched (`server`/`client`/`reviewer-core`/`mcp`, never `e2e`), root `specs/<feature>.md` if ≥ 2 (+ see-also lines in each module's `specs/README.md`); `SPEC-NN`, EARS `AC-n`, `Status: draft`, inline `[NEEDS CLARIFICATION]`; report `SPEC · FOLDER (why) · INDEX · NEEDS CLARIFICATION · PROPOSALS AWAITING DECISION · DESIGN SOURCES · NEXT` — or a blocking `QUESTIONS` block (no file) | main session / user |
| [implementation-planner](implementation-planner.md) | HOW and in what order: turn approved specs of a feature that spans 2+ packages or 3+ tasks into an executable plan; asks only "how" + execution mode; no specs, no code | `spec:` paths (approved, no `[NEEDS CLARIFICATION]`) (+ `mode:`, `answers:`) | `plans/<feature>.md` from [TEMPLATE](../../plans/TEMPLATE.md) (`Status: draft`, `Execution mode`, `Covers:` per task) + its line in [plans/README](../../plans/README.md); chat summary (path, specs, mode, AC → task coverage, wave table, open questions, could-not-verify) — or `QUESTIONS`, or `CANNOT PLAN → run spec-creator` with `SPEC-NN/AC-n` + evidence | main session / user |
| [implementer-backend](implementer-backend.md) | Write the code of ONE `[backend]` task: `server/`, `reviewer-core/`, `e2e/` | `plan: plans/<f>.md` + `task: T<n>` (+ `base` commit) | code + tests in the task's owned files only; report `STATUS · FILES · TESTS · DEVIATIONS · FOREIGN ERRORS · BLOCKER · INSIGHT CANDIDATES` | [/implement-plan](../skills/implement-plan/SKILL.md) |
| [implementer-frontend](implementer-frontend.md) | Same for ONE `[frontend]` task: `client/` | same | same | [/implement-plan](../skills/implement-plan/SKILL.md) |
| [test-writer](test-writer.md) | Write tests for existing code in `client/`, `server/`, `reviewer-core/`; prove each can fail; report bugs as failing tests | `target:` paths (+ `focus:`, `spec:`) | test files / test helpers only; report `STATUS · FILES · BEHAVIOURS · RED CHECK (one per test) · RUN · SHUFFLE · TYPECHECK · BUGS FOUND · NEEDS PRODUCTION CHANGE` | user (`@test-writer`) |
| [architecture-reviewer](architecture-reviewer.md) | Check a change set against architectural boundaries (onion + layer check, client layering, cross-package, workspace scoping); no fixes | `base:`/`head:` (+ `scope:`, `plan:`) | report `VERDICT PASS/FAIL · CHECKS RUN · FINDINGS (≥ 80, evidence) · PRE-EXISTING · UNVERIFIED · NOT CHECKED` | [/implement-plan](../skills/implement-plan/SKILL.md) §7 · user |
| [security-reviewer](security-reviewer.md) | Security review of a change set: trace attacker input → sink (IDOR/workspace scoping, secrets, untrusted text → LLM/UI, path traversal, SSRF, uploads, injection, MCP output); grade CRITICAL/HIGH/MEDIUM/LOW; no fixes | `base:`/`head:` (+ `scope:`, `plan:`) | report `VERDICT PASS/FAIL (FAIL ⇔ CRITICAL/HIGH) · COUNTS · FINDINGS (source → sink, ≥ 80) · PRE-EXISTING · UNVERIFIED · NOT CHECKED` | [/implement-plan](../skills/implement-plan/SKILL.md) §7 · user |
| [brainstorm](brainstorm.md) | Compare 2–4 grounded options for ONE decision (product or technical) and recommend one; no code, no files | `decision:` (+ `context:`, `stage:`) | chat report `DECISION · GROUNDING · OPTIONS · REJECTED · RECOMMENDATION · WOULD CHANGE IF · OPEN QUESTIONS · NEXT` | user, before spec-creator / implementation-planner |
| [plan-verifier](plan-verifier.md) | Check code against EVERY plan item and linked spec criterion with fresh evidence; no generic advice | `plan:` (+ `base:`, `head:`, `task:`, `run:`) | report `VERDICT COMPLIANT/NOT COMPLIANT/INCOMPLETE EVIDENCE · COVERAGE · REQUIREMENTS table · OWNERSHIP · SPEC ↔ PLAN · TRACEABILITY (SPEC-NN/AC-n → task → test → commit) · GAPS · COMMANDS RUN` | [/implement-plan](../skills/implement-plan/SKILL.md) §7 · user |
| [doc-writer](doc-writer.md) | Turn a plan / spec / code into package docs with Mermaid diagrams, grounded in code, in the right file | `from:` (+ `topic:`, `packages:`) | doc files + index line; report `STATUS · FILES · DIAGRAMS · SOURCES · DISCREPANCIES · SUGGESTIONS` | user · offered at `/implement-plan` §7 |

Not agents but part of the set: [implementer-protocol](../skills/implementer-protocol/SKILL.md) (shared
working protocol injected into both implementers — edit it there) and
[implement-plan](../skills/implement-plan/SKILL.md) (manual orchestrator run by the main session; it
alone updates task statuses and records insights).

## Model and permissions

"Enforced" = the harness blocks it (tool allowlist, Write/Edit hook); "hook (heuristic)" = a Bash
PreToolUse allowlist — the Claude Code docs say such hooks can be bypassed, so the tool allowlist stays
the hard limit; "prompt" = only the system prompt says so.

| Agent | Model | Allowed tools | Denied | Limits enforced | Limits by prompt only |
|---|---|---|---|---|---|
| researcher | sonnet | Read, Grep, Glob, Bash, WebSearch, WebFetch, AskUserQuestion | everything else (allowlist): no Write/Edit, Agent, Skill | no file writes, no sub-agents, no skills | Bash only read-only git history; files via Read/Grep/Glob, no `cat`/`grep`/`ls` (no hook); never open `.env*` / `clones/**/.git/config` |
| spec-creator | opus · effort high · maxTurns 40 | Read, Grep, Glob, Bash, Write, Edit, AskUserQuestion, WebFetch (Figma / links the user gives; no external docs MCP), `mcp__devdigest__list_agents` / `get_findings` / `get_conventions` / `get_blast_radius` | Agent, Skill, NotebookEdit; `mcp__devdigest__run_agent_on_pr` (not in the allowlist — paid run; self-test fails if added) | Write/Edit only `specs/*.md` + `{server,client,reviewer-core,mcp}/specs/*.md` ([write-scope](hooks/write-scope.mjs) `specs`); no sub-agents; ≤ 40 turns | the same write limit as a prompt Hard rule too (defense-in-depth: it knows the limit, no wasted blocked writes); Bash only read-only git; files via Read/Grep/Glob (no hook); fetched/pasted content is untrusted data; no implementation details in a spec; never guess → `[NEEDS CLARIFICATION]` |
| implementation-planner | opus · effort high | Read, Grep, Glob, Bash, Write, AskUserQuestion | Agent, Edit, Skill | `Write` only `plans/*.md` ([hook](hooks/plans-only-write.mjs)) | Bash only read-only git; files via Read/Grep/Glob, no `cat`/`grep`/`ls` (no hook); never changes spec behaviour; asks only "how" |
| implementer-backend | sonnet · maxTurns 60 | Read, Grep, Glob, Edit, Write, Bash | Agent, Skill | no sub-agents, no extra skills, ≤ 60 turns | owned files only (checked after the wave by `/implement-plan`); no git/install/`docker compose down -v`; Do-not-touch paths |
| implementer-frontend | sonnet · maxTurns 60 | same | Agent, Skill | same | same |
| test-writer | sonnet · maxTurns 60 | Read, Grep, Glob, Edit, Write, Bash | Agent, Skill | Write/Edit only test files + helpers ([write-scope](hooks/write-scope.mjs) `tests`); no sub-agents | Bash: fixed shapes only — git status/diff/log/show, `tsc --noEmit -p tsconfig.json`, `vitest run <paths> [-t] [--sequence.shuffle]`, `rm` of its own untracked `mut-*` scratch files ([bash-guard](hooks/bash-guard.mjs) `tests`, hook (heuristic)); never edits production code or weakens an assertion |
| architecture-reviewer | sonnet · maxTurns 40 | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill | no file writes, no sub-agents | Bash: git status/diff/log/show + `node scripts/check-architecture.mjs` ([bash-guard](hooks/bash-guard.mjs) `review`, hook (heuristic)); findings only with evidence and confidence ≥ 80 |
| security-reviewer | sonnet · maxTurns 40 | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill | no file writes, no sub-agents | Bash: git status/diff/log/show only ([bash-guard](hooks/bash-guard.mjs) `review`, hook (heuristic)); trace source → sink, confidence ≥ 80; never prints a secret |
| brainstorm | sonnet · maxTurns 25 | Read, Grep, Glob, AskUserQuestion | Write, Edit, NotebookEdit, Bash, Agent, Skill | no file writes, no shell, no sub-agents | 2–4 options, Do-not-touch / INSIGHTS-breaking options only as REJECTED; no implementation plan |
| plan-verifier | opus · effort high · maxTurns 80 | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Skill | no file writes, no sub-agents | Bash: `review` + `tsc --noEmit` + `vitest run` ([bash-guard](hooks/bash-guard.mjs) `verify`, hook (heuristic)); no row without a requirement ID |
| doc-writer | sonnet · maxTurns 40 | Read, Grep, Glob, Edit, Write, Bash | Agent, Skill | Write/Edit only READMEs, `TESTING.md`, `<pkg>/docs/**/*.md` ([write-scope](hooks/write-scope.mjs) `docs`) | Bash: `cd` + git status/diff/log/show only ([bash-guard](hooks/bash-guard.mjs) `docs`, hook (heuristic)); no behaviour not found in code |

`AskUserQuestion` may be unavailable when an agent runs as a subagent — then it returns its questions
to the caller instead of asking.

test-writer scratch files: write-scope forbids editing production code, so a RED-check that mutates a
module copies it to a scratch file inside the package (`src/test/mut-<x>.ts` + `src/lib/mut-<x>.test.ts`).
These files must be named `mut-*`; test-writer deletes them itself with `rm` (bash-guard `tests` allows
`rm [-f]` only for untracked `mut-*.ts(x)` under `client/`, `server/` or `reviewer-core/`, never in
`vendor/`, `node_modules/`, `clones/`). After every test-writer run the caller still checks
`git status --short` for leftover `mut-*` files and removes any it finds.

### Limits

- [bash-guard](hooks/bash-guard.mjs) is defense-in-depth against accidental or typical agent commands,
  **not a sandbox** against a deliberate bypass: it parses bash text heuristically and cannot model
  every shell or tool behaviour. The hard limits are the `tools` allowlist (no Write/Edit for
  reviewers), [write-scope](hooks/write-scope.mjs) and the caller reviewing the diff.
- Known open bypass (left unpatched on purpose, 2026-11-06): the guard follows every `cd` to a
  safe-looking target, even one that does not exist. In `cd nope/a/b; git diff ../../../x README.md`
  (or with `||`) bash's `cd` fails and git runs from the repo root, so the `../` path leaves the work
  tree and git's implicit `--no-index` prints a file from above the repo. A fix would accept `cd` only
  into an existing directory and allow only `&&` after it.
- spec-creator, implementation-planner and researcher have **no bash-guard**: "read files with Read/Grep/Glob, Bash only for
  read-only git" is a prompt rule only.

## Injected skills (`skills:` frontmatter — full text loaded at start)

| Skill | implementation-planner | impl-backend | impl-frontend | test-writer | arch-reviewer | sec-reviewer | doc-writer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| implementer-protocol | | ● | ● |  |  | |  |
| onion-architecture | ● | ● | | ● | ● | |  |
| fastify-best-practices | ● | ● | | ● |  | |  |
| drizzle-orm-patterns | ● | ● | |  |  | |  |
| postgresql-table-design | ● | ● | |  |  | |  |
| zod | ● | ● | | ● |  | |  |
| typescript-expert | ● | ● | ● | ● |  | |  |
| security | ● | ● | ● | ● |  | ● |  |
| frontend-ui-architecture | ● | | ● |  | ● | |  |
| react-best-practices | ● | | ● |  |  | |  |
| next-best-practices | ● | | ● |  |  | |  |
| react-testing-library | ● | | ● | ● |  | |  |
| mermaid-diagram | | | | | | | ● |

researcher and spec-creator have none (spec-creator describes behaviour, not stack — skills would pull it
into implementation detail). Sync rules: each implementer set = all skills that
[routing.json](../skills/pr-self-review/references/routing.json) routes to its packages (client has no
non-vendor `zod` imports → no `zod` in frontend); implementation-planner = union of both implementer sets.
Add a skill to an implementer → add it to the implementation-planner too.
test-writer = the skills `routing.json` routes to test files (`react-testing-library` for client tests,
`security` and `zod` for all TS, `typescript-expert` for `reviewer-core/src`) + `onion-architecture` /
`fastify-best-practices` for per-ring server testing; the
implementation-planner already holds all of them. The union rule does not extend to the reviewers or doc-writer.
security-reviewer gets only `security` (OWASP + confidence-based review); brainstorm has none (it compares options, not rules).
plan-verifier has no skills on purpose: it checks compliance, and skills would pull it toward generic advice.

## Where the agents' rules come from

Status: **verified** = read in the source on 2026-11-06 · **via researcher** = from the researcher's
report of 2026-11-06, not re-read · **internal** = this repo · **decision** = the user's choice.

| Source | Status | Rules it grounds | Where |
|---|---|---|---|
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | verified | `skills:` preload (full text, max 32, no `disable-model-invocation`, missing name skipped silently → `BLOCKED` check); `tools`/`disallowedTools` allowlist; `model`, `effort`, `maxTurns`; frontmatter `hooks:` PreToolUse, exit 2 = block; fresh context per subagent → self-contained plan + `plan`/`task` input | all frontmatter; [hook](hooks/plans-only-write.mjs); protocol §1 |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | via researcher | give a runnable check and a "done" definition → Verify per task; interview before spec → spec-creator Step 3; document only what the repo doesn't show → implementation-planner discovers modules instead of a hard-coded list | spec-creator Step 3; implementation-planner Step 1; TEMPLATE `Verify` |
| [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | via researcher | each worker gets objective, output format, boundaries; explicit effort-scaling → ≤ 4 tasks per wave | protocol §1/§5; implementation-planner "Waves" |
| [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | via researcher | orchestrator-workers for multi-file changes; minimal tools, short prompts | pipeline; tool allowlists |
| [obra/superpowers](https://github.com/obra/superpowers) — `writing-plans`, `subagent-driven-development`, `dispatching-parallel-agents` (community) | via researcher | file map before tasks; exact paths + interfaces per task; no "TBD"; plan self-check; parallel only with no shared files, all in one message; `DONE / DONE_WITH_CONCERNS / BLOCKED`; implementers don't dispatch sub-agents | TEMPLATE; implementation-planner Steps 3–4; protocol §3/§5; `/implement-plan` §2 |
| [github/spec-kit `tasks-template.md`](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) (community) | via researcher | `T<n>` IDs; blocking foundational phase → W0 contracts; checkpoints → gate per wave | TEMPLATE "Waves"; `/implement-plan` §4 |
| root `CLAUDE.md` (= `AGENTS.md`), `<pkg>/CLAUDE.md` | internal | Do-not-touch paths; module layout; workspace scoping; session protocol (and the implementers' exemption from it) | implementation-planner Hard rules; protocol §0/§3 |
| `<pkg>/INSIGHTS.md` | internal | no `vendor/shared` edits → module types + client mirror; Windows bins via `node`; `check-architecture.mjs` baseline; hotspot/i18n traps | implementation-planner Global constraints + per-task Insights; protocol §2; [plans/README](../../plans/README.md) Verify commands |
| [pr-self-review routing.json](../skills/pr-self-review/references/routing.json) | internal | which skills each implementer (and the implementation-planner) must carry | `skills:` lists |
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) (2nd pass) | via researcher | `permissionMode: plan` is overridden by a bypass/acceptEdits/auto parent → tool allowlist is the read-only control; `Bash(...)` in `disallowedTools` removes the whole tool → Bash narrowing only via a PreToolUse hook, which "can be bypassed" → "hook (heuristic)" | reviewers' frontmatter; [bash-guard](hooks/bash-guard.mjs) |
| [Anthropic code-review plugin — confidence scoring](https://instagit.com/anthropics/claude-code/code-review-confidence-scoring-claude-code.md) (mirror; primary 404) | via researcher, secondary | confidence 0–100, report ≥ 80, re-validate each finding | architecture-reviewer §6 |
| [obra/superpowers](https://github.com/obra/superpowers) — `verification-before-completion`, `requesting-code-review`, `test-driven-development` (community) | via researcher | fresh evidence only, "don't trust agent reports, check the VCS diff", requirements line by line; base/head SHA as reviewer input; watch every test fail (RED check) | plan-verifier §1/§5–§6; architecture-reviewer input; test-writer §6 |
| [github/spec-kit `/analyze`](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md) (community) | via researcher | strictly read-only; requirement inventory with IDs; requirements without tasks AND tasks without requirements; coverage % | plan-verifier §3/§7/§8 |
| [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | via researcher | rule name + path per violation → rule id + evidence | architecture-reviewer §4 |
| [Testing Library queries](https://testing-library.com/docs/queries/about/#priority) · [user-event](https://testing-library.com/docs/user-event/intro/) · [TanStack Query testing](https://tanstack.com/query/latest/docs/framework/react/guides/testing) · [Vitest sequence](https://vitest.dev/config/sequence) · [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) · [Testcontainers Postgres](https://node.testcontainers.org/modules/postgresql/) · [Kent C. Dodds — implementation details](https://kentcdodds.com/blog/testing-implementation-details) | via researcher | role queries first, `userEvent.setup()`, fresh `QueryClient` with `retry: false`, `--sequence.shuffle`, `app.inject`, real Postgres per `.it.test.ts`, test behaviour not internals | test-writer §5–§6 |
| [Diátaxis](https://diataxis.fr/) · [C4](https://c4model.com/) · [arc42](https://arc42.org/overview) · [ADR](https://adr.github.io/) · [GitHub Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) · [Google style highlights](https://developers.google.com/style/highlights) | via researcher | one doc type per file; diagram level per audience; "Decisions" section as ADR-lite; GitHub renders Mermaid; active voice, sentence case | doc-writer §4–§6 |
| user decisions, 2026-11-06 (agents plan) | decision | reviewers get Bash behind the allowlist hook; test-writer keeps a failing test on a real bug and never edits production code; doc-writer never writes `specs/`; verifiers run only at `/implement-plan` §7 | [plans/review-and-docs-agents.md](../../plans/review-and-docs-agents.md) |
| [github/spec-kit `/specify` + `/clarify`](https://github.com/github/spec-kit/tree/main/templates/commands) (community) | from the user's brief, not re-read 2026-11-08 | spec = what/why without how; `[NEEDS CLARIFICATION: …]` markers instead of guesses; clarify in rounds of a few targeted questions with a recommended answer; spec before plan | spec-creator Steps 3–5; implementation-planner Step 0 |
| EARS — A. Mavin et al., "Easy Approach to Requirements Syntax", IEEE RE 2009 (Rolls-Royce) | from the user's brief | 5 patterns: Ubiquitous / WHEN / WHILE / IF…THEN / WHERE — one testable statement per criterion | spec-creator Step 4 |
| user decisions, 2026-11-08 (SDD agents) | decision | spec-creator (opus, maxTurns 40, read-only devdigest MCP, no `run_agent_on_pr`) owns WHAT/WHY: 1 module → `<module>/specs/`, ≥ 2 → ONE root `specs/` spec; prompt write rule + hook (defense-in-depth); design sources user-given first (Read/WebFetch) then repo; blocking questions via AskUserQuestion, the rest inline `[NEEDS CLARIFICATION]`; spec template + Module interactions + Design review; `SPEC-NN` repo-unique, `AC-n` per spec; the plan agent renamed to `implementation-planner`: plans only from approved specs, spec feasibility check → `CANNOT PLAN → run spec-creator`, mandatory `Covers:`, `.claude/**` stays Do-not-touch; Execution mode multi-agent (≥ 6 tasks and a wave with ≥ 2 independent tasks) / single-agent; plan-verifier traceability matrix | [spec-creator](spec-creator.md); [implementation-planner](implementation-planner.md); [plan-verifier](plan-verifier.md); TEMPLATE; `/implement-plan` |
| user decisions, 2026-11-06 | decision | two implementer files; plans in `plans/`; no worktrees (disjoint ownership instead); implementers only write code, no self-audit; every relevant skill injected, implementation-planner gets all of them; `CANNOT PLAN` note instead of invented tasks | agent files; protocol §4; implementation-planner |
| mentor review 2026-11-08 (+ reference fork `yudbox/dev-digest`, branch `feat/hw4-blast-mcp-fixes`) | decision | add `brainstorm` (options before spec/plan) and `security-reviewer` (severity CRITICAL/HIGH/MEDIUM/LOW, `security` skill); security-reviewer joins plan-verifier + architecture-reviewer at `/implement-plan` Finish | [brainstorm](brainstorm.md) · [security-reviewer](security-reviewer.md) · [implement-plan](../skills/implement-plan/SKILL.md) §7 |

## Supporting files

| File | Role |
|---|---|
| [hooks/plans-only-write.mjs](hooks/plans-only-write.mjs) | implementation-planner's PreToolUse guard: `Write` outside `plans/*.md` → exit 2 |
| [hooks/write-scope.mjs](hooks/write-scope.mjs) | Write/Edit guard, profiles `tests` (test-writer) · `docs` (doc-writer) · `specs` (spec-creator: root `specs/*.md` + `{server,client,reviewer-core,mcp}/specs/*.md`, no subfolders, never `e2e/specs`); path normalized first (`\` → `/`, resolved against the project root), deny before allow, fails closed |
| [hooks/bash-guard.mjs](hooks/bash-guard.mjs) | Bash allowlist of FIXED command shapes, profiles `docs` (`cd` inside the repo, not into `clones`/`node_modules`/`.git`; `git [--no-pager] status\|diff\|log\|show` with a small flag allowlist — no `--output`, `--ext-diff`, `--no-index`, `-c`, `-C`, `-O`; path arguments must stay inside the repo) ⊂ `review` (+ `node scripts/check-architecture.mjs` in `server/`) ⊂ `verify` (+ in a package dir: `tsc --noEmit -p tsconfig.json`, `vitest run [<paths>] [--exclude '**/*.it.test.ts'] [-t <name>] [--sequence.shuffle]`) ⊂ `tests` (+ `rm [-f]` of untracked `mut-*.ts(x)` inside a package). No file-reading/text commands at all (`cat`/`head`/`tail`/`grep`/`rg`/`sed`/`sort`/`find`/`wc`/`ls`, `git grep`) — agents use Read/Grep/Glob. Rejects `$(`, backticks, every `$` outside single quotes, redirects, `&`, unquoted globs/braces; heuristic |
| [hooks/self-test.mjs](hooks/self-test.mjs) | allow/block cases for all hooks + frontmatter lint of every agent file (keys, skills, hook paths, profiles, `mcp__devdigest__*` names checked against the `registerTool` calls in `mcp/src/tools`, `run_agent_on_pr` forbidden for spec-creator) + lint negative cases |
| [plans/TEMPLATE.md](../../plans/TEMPLATE.md) | plan structure the implementation-planner fills |
| [plans/README.md](../../plans/README.md) | plan index, lifecycle, the single list of Verify commands |

## Conventions

- File name = `name` in frontmatter, kebab-case. Keys are camelCase and must match the docs exactly — a
  typo is ignored silently.
- Agent definitions are read when the session starts: after editing `.claude/agents/*.md` run `/clear`
  (or restart) before using the agent, otherwise the old version runs.
- Restrict `tools` to what the agent needs; prefer a hook over a prompt rule when a limit must hold.
- Rules that live in `CLAUDE.md` / `INSIGHTS.md` / skills are referenced, not copied into agent prompts.
- After editing an agent file or a hook run `node .claude/agents/hooks/self-test.mjs` (repo root) → exit 0.
