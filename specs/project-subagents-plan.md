# Development Plan — six project subagents

Source: task text (2026-09-27) + planner draft + four researcher reports · Base: `3247c2b` + uncommitted tree · Packages: none (`.claude/agents/**`, root `AGENTS.md`, `docs/README.md` ×5)

Decisions taken by the user: security agent is a new project subagent named `security-reviewer` (renamed from `appsec-reviewer` on 2026-09-27: it serves a different purpose than the product's Security Reviewer, so the shared noun is accepted and the description disambiguates); security severity is a four-band scale with a fixed mapping onto the gate; the guards share one library; **tests may be run in this project without asking**; **every agent must work as specified for any developer, independent of personal `~/.claude` settings.**

## 0. Before the first edit

- INSIGHTS root § Tool & Library Notes — "A project subagent cannot ask the user anything" → every agent returns `## Clarification needed` / `## Blocked`; none lists `AskUserQuestion`; to forbid skills, deny `Skill`; frontmatter hooks only run after workspace trust, so every guarded rule is also written in the agent's text.
- INSIGHTS root § What Doesn't Work — `guard-pr.sh` refuses any command line that STARTS with the PR-create text → guard test inputs live in `scripts/guard-cases.tsv`, never in a Bash command or heredoc.
- INSIGHTS root § What Doesn't Work — substring-matching `PreToolUse(Bash)` hooks lock you out → match in command position, per segment, verified by an allow/deny table through `--check`.
- INSIGHTS root § Tool & Library Notes — `jq //` treats `false` as empty → booleans read with `if has("k") then .k else … end`.
- INSIGHTS root § What Works / § Recurring Errors — dev-DB writes via dry run on a copy; `dev.sh` started from an agent dies with it → every guard keeps the DB / Docker-volume denylist and blocks `./scripts/dev.sh`.
- INSIGHTS root § Codebase Patterns — search the noun first → the noun `security-reviewer` is also the product's reviewer (`docs/agent-prompts/security-reviewer.md`, `server/src/db/seed.ts:216`); the subagent keeps the name and its description says it is not that agent.
- INSIGHTS server — "The hermetic lane is not hermetic" → server unit tests run with `DATABASE_URL=postgres://isolated:isolated@127.0.0.1:1/isolated`; "`pnpm typecheck` does not look at `test/**`" → server / reviewer-core tests are type-checked through a throwaway `tsconfig.test-check.json`.
- INSIGHTS client § Recurring Errors — mock-reset hooks need a block body; RTL matches text per element; a value import from `@devdigest/shared` in `client/` breaks `next build` (an architecture check); next-intl: register every namespace the rendered tree uses.
- Research (sources in `.claude/agents/README.md` § Sources): path-scoped writes are not expressible in agent frontmatter (anthropics/claude-code#31940, closed not planned) → `PreToolUse` hooks; a session in `bypassPermissions` forces its subagents into it → `permissionMode` is not a guard, `tools`/`disallowedTools` + hooks are.
- Read: `.claude/agents/{README,planner,implementer,researcher}.md`, `scripts/implementer-guard.sh`, `.claude/skills/pr-self-review/{SKILL.md,rules/*.md,scripts/*}`, `.claude/skills/{security,onion-architecture,frontend-ui-architecture,mermaid-diagram,react-testing-library,engineering-insights}/SKILL.md`, `TESTING.md`, `docs/README.md`, `specs/README.md`.

## 1. Scope

Goal: the main session can delegate to six new agents — `test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer`, `brainstorm`, `security-reviewer` — each with one role, explicit tool allow/deny lists, a model, a Step 0 input check, a fixed output format and a handoff; write scopes and read-only status are enforced by project hooks, not by anyone's personal settings.

Non-goals: product code; changes to `pr-self-review` (it stays the only merge gate); changes to planner / researcher behaviour; new skills; e2e flow authoring.

Self-containment rules (apply to every agent file):
- Every rule the agent needs is written in its own file or in a project file it names (`AGENTS.md`, `TESTING.md`, `.claude/skills/**`). No reference to `~/.claude`, user-level skills or plugins (e.g. `superpowers:*`), or the user's personal CLAUDE.md.
- Hard limits (writes, git, DB, installs, test runners where forbidden) are enforced by a project hook AND stated in the text.
- No `permissionMode` is relied on for safety.
- Hooks need no optional tooling: JSON payload read with `jq`, falling back to `node` (Node ≥ 22 is a project requirement).
- Project policy stated where it matters: tests may be run without asking (`AGENTS.md` § Conventions); no git history/working-tree changes by agents; comments only for a non-obvious why; docs short; never run project-wide Prettier.

Acceptance criteria:
- AC1 Six new `.claude/agents/*.md` files with valid frontmatter, `name` = file stem, model ∈ {opus, sonnet, haiku, fable, inherit} or a full `claude-*` id; `check-agents.sh` exits 0 for all nine agents.
- AC2 Only test-writer and doc-writer have Write/Edit; the four others deny Write, Edit, NotebookEdit, Agent; none lists `AskUserQuestion`.
- AC3 `write-scope-guard.sh --profile tests` allows Edit/Write only on test paths + the two throwaway tsconfigs; allows vitest runs; blocks installs, `dev.sh`/`e2e.sh`, git mutations, DB writes, file-mutating Bash outside scope.
- AC4 `write-scope-guard.sh --profile docs` allows Edit/Write only on doc paths; blocks `CLAUDE.md`, `INSIGHTS.md`, `specs/**`, `*/specs/**`, `.claude/**`, `docs/agent-prompts/**`, `docs/design/**`, source code; blocks test runners.
- AC5 `readonly-guard.sh` allows the read/static-check allowlist; blocks writes, redirects to files, git mutations, installs, `write-verdict.sh`, `append-insight.sh`; test runners only with `--allow-tests`.
- AC6 `implementer-guard.sh` returns the baseline exit code on every implementer row, except the documented change: new agent definitions `.claude/agents/<name>.md` become writable (guard scripts, `implementer.md`, `README.md` and settings stay blocked).
- AC7 `.claude/agents/README.md`: pipeline diagram with all nine agents + the gate, nine catalog rows whose Model matches the frontmatter, shared contracts, one table per guard, sources; "deliberately outside this set" removed.
- AC8 architecture-reviewer and security-reviewer carry a byte-identical `Finding fields:` line; gate severity from `rules/severity.md`.
- AC9 plan-verifier covers plan §0–8 + every spec requirement/AC/non-goal with exactly done / partial / missing / deviated, separate "Unplanned changes" and "Needs a test run" tables, and forbids quality/style/security commentary.
- AC10 `security-reviewer`'s description and opening paragraph say it is not the product's Security Reviewer (`docs/agent-prompts/security-reviewer.md`).
- AC11 Root `AGENTS.md` links `.claude/agents/README.md` under Read when and states the test policy; the five `docs/README.md` say `../AGENTS.md`, not `../CLAUDE.md`.

## 2. Impact map

| Path | New / Modify | Placement | AC |
|---|---|---|---|
| `.claude/agents/scripts/check-agents.sh` | New | agent tooling | AC1, AC2, AC7, AC8 |
| `.claude/agents/scripts/guard-lib.sh` | New | shared guard functions | AC3–AC6 |
| `.claude/agents/scripts/implementer-guard.sh` | Modify | guard | AC6 |
| `.claude/agents/scripts/readonly-guard.sh` | New | guard | AC5 |
| `.claude/agents/scripts/write-scope-guard.sh` | New | guard | AC3, AC4 |
| `.claude/agents/scripts/guard-cases.tsv` | New | guard case table | AC3–AC6 |
| `.claude/agents/scripts/check-guards.sh` | New | guard verifier | AC3–AC6 |
| `.claude/agents/{architecture-reviewer,security-reviewer,plan-verifier,brainstorm,test-writer,doc-writer}.md` | New | agents | AC1, AC2, AC8–AC10 |
| `.claude/agents/README.md` | Modify | agents map | AC7 |
| `AGENTS.md` | Modify | root map | AC11 |
| `docs/README.md`, `{server,client,reviewer-core,e2e}/docs/README.md` | Modify | docs rules | AC11 |
| `.claude/skills/onion-architecture/rules/testing.md` | Modify (§ Standing project rule → test policy) | skill rule | AC11 |
| `.claude/agents/implementer.md` | Modify (`.claude/agents` rule, `MultiEdit` matcher) | agent | AC6 |

## 3. Constraints in play

- No package code changes → no dependency-cruiser rule is at stake; reviewers must *cite* the ten rule names in `server/.dependency-cruiser.cjs` (`drizzle-only-in-repositories`, `schema-only-in-repositories`, `no-row-types-in-transport`, `no-domain-to-infra`, `no-adapter-to-module`, `no-cross-module-internals`, `core-purity`, `core-llm-sdk-stays-in-llm-folder`, `no-service-to-container`, `no-circular`) — verify the list against the file.
- Single sources the agents point at instead of copying: `routing.md` (file → skill), `rules/severity.md` (gate severity), `planner.md` Step 4 (plan layout), `TESTING.md` (lanes), `docs/README.md` § Rules (doc placement).
- Hook commands in frontmatter: `"\"$CLAUDE_PROJECT_DIR/.claude/agents/scripts/<guard>.sh\" [args]"`; matcher for write guards `Bash|Edit|MultiEdit|Write` (harmless if `MultiEdit` does not exist).
- Descriptions short and trigger-oriented; details in the body. No comments inside YAML.

## 4. Stages

Stages 1–3 and 7–8 are executed by the calling session (they change the guards the implementer runs under). Stages 4–6 are six independent agent files, one implementer each, in parallel; each implementer writes ONLY its own agent file.

### Stage 1 — Agent validator
Files: New `scripts/check-agents.sh`
Steps:
1. `check-agents.sh [--dir <path>] [--skip-readme] [<name>…]`; needs `python3` + PyYAML, exits 3 with a message otherwise.
2. Per file: frontmatter parses; `name`, `description`, `model`, `tools` present; `name` = stem; model valid; `permissionMode` ∈ {default, manual, acceptEdits, plan, auto, dontAsk, bypassPermissions} if present; `tools ∩ disallowedTools = ∅`; no `AskUserQuestion` in `tools`; each `skills:` entry exists in `.claude/skills/<s>/SKILL.md`; each hook command's script exists and is executable.
3. Unless `--skip-readme`: README row `| [<name>](<name>.md) |` exists and its Model column equals `model`.
4. If both reviewers exist: their `Finding fields:` lines are identical.
Done when: three existing agents `ok` (with `--skip-readme` if needed); a renamed copy in a temp dir → exit 1 `FAIL wrong: name`.

### Stage 2 — Shared guard library, implementer-guard unchanged in behaviour
Files: New `guard-lib.sh`, `guard-cases.tsv`, `check-guards.sh`; Modify `implementer-guard.sh`
Steps:
1. TSV first (`guard⇥args⇥mode⇥input⇥expected_exit`), `check-guards.sh` runs each row via `--check` / `--check-path`, prints mismatches, exits 1 on any.
2. Capture the baseline of the current `implementer-guard.sh`.
3. Move `segments`, `normalize`, git / gh-pr / DB / docker / psql checks, protected-path checks and payload reading (jq → node fallback) into `guard-lib.sh`; `block()` uses `GUARD_NAME` / `GUARD_HINT`.
4. implementer-guard: `.claude/agents/<name>.md` writable except `implementer.md` and `README.md`; `.claude/agents/scripts/**` and `.claude/settings*.json` still blocked.
Done when: `bash -n` passes; `check-guards.sh` exits 0; implementer rows equal the baseline except the documented `.claude/agents/<name>.md` row.

### Stage 3 — readonly-guard and write-scope-guard
Files: New `readonly-guard.sh`, `write-scope-guard.sh`; Modify `guard-cases.tsv`
Steps:
1. `readonly-guard.sh [--allow-tests]` (matcher `Bash|Edit|MultiEdit|Write|NotebookEdit`; any file-writing tool is blocked outright). Bash is an allowlist per segment: read-only git (`status diff log show blame grep ls-files rev-parse merge-base cat-file describe shortlog`, `remote -v`, `branch` listing), text tools (`ls cat head tail wc grep rg find sort uniq cut tr sed diff cmp jq realpath dirname basename stat file date echo printf test [ true cd pwd which`; `awk` deliberately left out — `print > "f"` and `system()` inside its quoted program are invisible to the guard), static checks (`pnpm typecheck`, `npm run typecheck`, `pnpm exec depcruise`, `pnpm exec tsc --noEmit`, `npx tsc --noEmit`), `collect-diff.sh`, `route-skills.sh`, `check-agents.sh`, `check-guards.sh`, `bash -n`. Extra blocks: `find -delete|-exec…`, `sed -i`, redirects to anything but `/dev/null` / `&1` / `&2`. `--allow-tests` adds `pnpm test`, `npm test`, `pnpm exec vitest run`, `npx vitest run`.
2. `write-scope-guard.sh --profile tests|docs`: Bash = lib denylist + installs, `dev.sh`, `e2e.sh`, `agent-browser`, `prettier --write`, `*:fix`, `tee`/`mv`/`cp`/`sed -i`/file redirects, `rm` outside the profile's throwaway paths; `append-insight.sh` allowed. Test runners: allowed for `tests`, blocked for `docs`. Edit/Write path allowlists per profile as in §1 AC3/AC4.
Done when: `check-guards.sh` exits 0 with every row.

### Stage 4 — architecture-reviewer + security-reviewer (parallel, one implementer each)
Files: New `.claude/agents/architecture-reviewer.md` / New `.claude/agents/security-reviewer.md`
Shared block (identical text in both):
- `Finding fields: severity · band · file · line · in_diff · skill · rule_source · title · evidence · failure · fix · verified`
- Gate severity from `.claude/skills/pr-self-review/rules/severity.md` (CRITICAL / WARNING / SUGGESTION, three-part test). Cap 10, CRITICAL first. Pre-existing issues outside the diff are never findings (one summary line at most).
- Per finding: `### F<n> — <SEVERITY> — <title>` + Location (`path:line`, in diff) · Rule · Evidence (quoted line or command + output) · Failure · Fix · Verified. Report ends with a fenced `json` array in the `severity.md` lane contract plus `in_diff, rule_source, evidence, verified` (security-reviewer adds `band, confidence, cwe, owasp, exploit`).
- Never writes a verdict, never runs `pr-self-review` or `engineering-insights`, never edits.
architecture-reviewer — model opus; tools `Read, Grep, Glob, Bash, Skill`; disallowed `Write, Edit, MultiEdit, NotebookEdit, Agent, WebSearch, WebFetch`; skills `onion-architecture, frontend-ui-architecture`; hook `readonly-guard.sh`. Step 0: base ref / plan / report optional; `collect-diff.sh --format list` (exit 3 → Clarification needed; empty → Nothing to review). Deterministic checks: depcruise when `server/` or `reviewer-core/src` touched; route→adapter grep from `onion-architecture/rules/enforcement.md`; one-sided contract change across the two `vendor/shared` copies (drift already on base is not a finding); client value imports from `@devdigest/shared`; `fetch(` outside `client/src/lib/api.ts`; reviewer-core importing beyond its alias / `node:`; server deep-importing reviewer-core internals. Judgement checks cite onion `rules/*.md` and frontend-ui-architecture files. Only violations of a named rule are findings — not drift already on base, not preference. Output: header, INSIGHTS, Checks run table, Findings, Handoff surfaces checked, Not checked, Findings (JSON). Handoff: CRITICAL/WARNING → implementer; clean → security-reviewer / doc-writer / pr-self-review.
security-reviewer — model opus; same tools/disallowed; skills `security`; hook `readonly-guard.sh`. Description names it as NOT the product's Security Reviewer (`docs/agent-prompts/security-reviewer.md`). Threat model built from code (`server/src/app.ts`, `server/src/adapters/auth/`, `server/AGENTS.md`, `server/docs/skills-in-prompt.md`, `reviewer-core/AGENTS.md` INJECTION_GUARD). Untrusted sources: GitHub PR data, clone contents, skill ZIPs, model output, HTTP body/params/query. The `security` skill is Express/MongoDB-oriented — the agent's text lists the stack-specific surfaces: Fastify route schemas, Drizzle `sql\`\`` / `sql.raw`, `simple-git` / `execFile` argument arrays (option smuggling via `--upload-pack`), `path.join` with repo-derived names, ZIP extraction, markdown/HTML rendering in Next, redirects, secrets/logging, prompt injection from PR content (LLM01, CWE-1427). Per surface: source → validation → upstream control → sink → reachable. Exclusions (never reported): DoS / resource exhaustion, rate limiting, missing hardening, outdated deps (→ researcher), test-only code, docs/markdown, server-controlled values (`process.env`), theoretical races, log spoofing. Confidence HIGH / MEDIUM / LOW (security skill table); report only when confident the issue is exploitable (≥ 0.8 = HIGH); MEDIUM reported as "needs manual verification"; LOW dropped. Band (reachability × impact × preconditions): Critical = remote/unauthenticated, no preconditions, high impact (RCE, SQLi, auth bypass, secret leak); High = one precondition; Medium = plausible chain or partial impact; Low = unlikely under the local-first single-operator model. Gate mapping: HIGH confidence + Critical/High → CRITICAL (still subject to the three-part test, else WARNING); Medium band or MEDIUM confidence → WARNING; Low band or LOW confidence → not reported. Fields add `band, confidence, cwe, owasp, exploit (preconditions → steps → impact)`. Extra sections: Threat model used, Surfaces examined table, Considered not reportable, → researcher. Never: exploit a running stack, network calls, keyword denylists against prompt injection.
Done when: `check-agents.sh --skip-readme architecture-reviewer security-reviewer` → ok, identical `Finding fields:` lines.

### Stage 5 — plan-verifier + brainstorm (parallel, one implementer each)
plan-verifier — model sonnet; tools `Read, Grep, Glob, Bash`; disallowed `Write, Edit, MultiEdit, NotebookEdit, Skill, Agent, WebSearch, WebFetch`; hook `readonly-guard.sh --allow-tests`. Step 0: no plan → Blocked; spec from plan header `Source:`; report optional; legacy layout (no `## 0.`–`## 8.`) → enumerate numbered steps; empty diff since Base → Nothing to verify. Scope via `collect-diff.sh --base <plan Base> --format list`. Item extraction table per plan section (§0 INSIGHTS lines, §1 each AC + each non-goal as "respected", §2 each row, §3 each constraint, §4 each step / tests-to-add / done-when, §5 each skill cell, §6 each verification row, §7 each [blocking] resolved, §8 each surface; spec: each requirement / AC / non-goal). Statuses: done / partial / missing / deviated (declared | undeclared); every status but missing needs `file:line`; missing lists the grep patterns searched. Bidirectional: code → plan ("Unplanned changes"). May run the plan's §6 commands, tests included (project policy), server unit lane with the isolated `DATABASE_URL`; results cited as evidence; commands it did not run go to "Needs a test run". Output: header + counts, Spec → plan → code, Plan items, Acceptance criteria, Unplanned changes, Needs a test run, Not verifiable. Never: quality/style/architecture/security opinions or general advice; trust a report claim without opening the file; edit.
brainstorm — model opus; tools `Read, Grep, Glob, Bash`; disallowed `Write, Edit, MultiEdit, NotebookEdit, Skill, Agent, WebSearch, WebFetch`; hook `readonly-guard.sh`. Step 0: decision/goal + boundary, else Clarification needed; only one rule-compliant option → say so, cite the rule, hand to planner. Steps: read AGENTS/INSIGHTS (What Doesn't Work rules options out), specs, skill rules via Read; decision drivers with weights and sources written BEFORE options; 2–4 options incl. the minimal / status quo baseline; each option: sketch, real paths touched, rules kept/broken, risks, reversibility, evidence; weighted comparison vs baseline (Pugh-style: −/0/+); recommendation + what flips it; consequences; external unknowns → researcher; handoff task text for planner. Output follows MADR headings. Never: stages or a plan, edits, web.
Done when: `check-agents.sh --skip-readme plan-verifier brainstorm` → ok.

### Stage 6 — test-writer + doc-writer (parallel, one implementer each)
test-writer — model sonnet; tools `Read, Grep, Glob, Edit, Write, Bash, Skill`; disallowed `Agent, WebSearch, WebFetch, NotebookEdit`; no preloaded skills (loaded per target via `route-skills.sh`); hook `write-scope-guard.sh --profile tests`. Step 0: plan + stages / ACs without test evidence / source files + behaviours; else Clarification needed; target code missing → Blocked. Steps: INSIGHTS + `TESTING.md`; classify each target by ring (client component/hook → RTL beside it; server domain/service/route → `server/test/<area>.test.ts` with mock ports / `app.inject()`; DB path → `*.it.test.ts` via `test/helpers/pg.ts`; contracts → parse/reject; reviewer-core → hermetic engine test) and load the routed skill; reuse existing helpers/mocks; write assertions from the spec/AC, not from current code — if code contradicts the spec, record a Gap instead of encoding the bug; per test ask "would it fail if this behaviour broke?"; no `.only/.skip`, snapshots, network, model keys, swallowing `try/catch`, or mocking the unit under test; query by role/label/text. Re-route written files. Static check (client `pnpm typecheck`; server/reviewer-core throwaway `tsconfig.test-check.json`, removed afterwards). Run the written tests (project policy — no confirmation needed): server unit with the isolated `DATABASE_URL`, `.it.test` needs Docker and self-skips — report the skipped count; client `pnpm exec vitest run <file>`; reviewer-core `npx vitest run <file>`. A failure: fix the test if the test is wrong; if the production code is wrong, leave the test failing-free (do not weaken it) and report it under Gaps → implementer. Close with `engineering-insights`. Output: Status, INSIGHTS, Tests written table (file, lane, test, proves AC, skill → rules), Static checks, Test runs (command · exit · passed/failed/skipped), Gaps, Not done. Never: edit production code, `mocks.ts`, `setup.ts`, vitest configs; add dependencies; weaken assertions.
doc-writer — model sonnet; tools `Read, Grep, Glob, Edit, Write, Bash, Skill`; disallowed `Agent, WebSearch, WebFetch, NotebookEdit`; skills `mermaid-diagram`; hook `write-scope-guard.sh --profile docs`. Step 0: subject + source material; unbuilt code → Blocked (specs hold intent, docs describe what exists). Placement table (root `docs/<topic>.md` cross-package why; `<pkg>/docs/<topic>.md` one package; `README.md` § Architecture; `<pkg>/README.md` pipeline/API/route map; `TESTING.md` suites; not INSIGHTS, not specs) with its rule source. Diátaxis type decides the shape (tutorial / how-to / reference / explanation). Diagram type by C4 level: context/container → `flowchart` (Mermaid C4 is experimental), runtime interaction → `sequenceDiagram`, data → `erDiagram`, lifecycle → `stateDiagram-v2`; ≤ 20 nodes, every node a real module/file. Short: what and why, `file:line` anchors, no retelling code, no changelog prose. Link from the matching `AGENTS.md` Read when (one bullet) + docs README Contents. Checks: every path mentioned exists, relative links resolve, `git status --short` shows only doc paths. Code disagrees with plan → document code, list discrepancy. Close with `engineering-insights`. Never: `CLAUDE.md`, `INSIGHTS.md` (except via `append-insight.sh`), `specs/**`, `docs/agent-prompts/**`, `.claude/**`, code.
Done when: `check-agents.sh --skip-readme test-writer doc-writer` → ok.

### Stage 7 — README, AGENTS.md, docs READMEs (calling session)
1. `.claude/agents/README.md`: Mermaid pipeline (brainstorm ⇢ planner → implementer → test-writer → plan-verifier → architecture-reviewer ∥ security-reviewer → doc-writer → pr-self-review gate → user commits; loops to implementer; researcher dashed); nine catalog rows; delete "deliberately outside this set"; shared contracts (review finding, severity mapping, plan sections each agent reads, test policy, write scopes, self-containment); `## Guards` with one table per guard + how to check; sources extended with the research links.
2. Root `AGENTS.md`: Conventions bullet "Tests may be run without asking"; Read when bullet → `.claude/agents/README.md`.
3. Five `docs/README.md`: `../CLAUDE.md` → `../AGENTS.md`.
Done when: `check-agents.sh` exits 0 for nine agents (README cross-check on).

## 5. Skills matrix

No domain skill routes to `.claude/**`, `*.sh` or root `*.md` (`routing.md` last path row) — conventions lane only (`pr-self-review/rules/repo-conventions.md`). Content sources the agent texts must match: stage 4 — `security/SKILL.md`, `pr-self-review/rules/severity.md`, `onion-architecture/rules/enforcement.md`, `frontend-ui-architecture/*.md`; stage 5 — `planner.md` Step 4, `specs/README.md`; stage 6 — `TESTING.md`, `onion-architecture/rules/testing.md`, `react-testing-library/SKILL.md`, `fastify-best-practices/rules/testing.md`, `routing.md`, `docs/README.md` § Rules, `mermaid-diagram/SKILL.md`.

## 6. Verification

| Command (repo root) | Proves |
|---|---|
| `bash -n .claude/agents/scripts/*.sh` | scripts parse |
| `.claude/agents/scripts/check-agents.sh` | AC1, AC2, AC7, AC8 |
| `.claude/agents/scripts/check-guards.sh` | AC3–AC6 |
| `grep -n "NOT the product" .claude/agents/security-reviewer.md` | AC10 |
| `grep -n 'Link every doc' docs/README.md */docs/README.md` → all `../AGENTS.md` | AC11 |
| `git status --short` | only §2 paths + pre-existing untracked files |
| manual: `/agents` in a new session | nine agents listed |

## 7. Risks and open questions

- [non-blocking] Loosening implementer-guard to allow new `.claude/agents/<name>.md` lets a future implementer edit reviewer definitions; plan-verifier's "Unplanned changes" is the check.
- [non-blocking] Readonly-guard's allowlist errs toward blocking; an agent that needs a new read command records it under "Not checked".
- Resolved: newly created agents were picked up by the running session (Claude Code 2.1.280).

## 8. Handoff to reviewers

- Architecture: `guard-lib.sh` becomes a shared dependency of three guards; the single-source files (`routing.md`, `severity.md`, `planner.md` Step 4, `docs/README.md`) gain readers.
- Security: path normalisation (`realpath -m`), paths outside the repo, `..`, symlinks, naive redirect/`rm` parsing; guards inert before workspace trust.
