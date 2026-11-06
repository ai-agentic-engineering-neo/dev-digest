# Development Plan: test-writer, architecture-reviewer, plan-verifier, doc-writer agents

<!-- Planner note: this plan targets `.claude/agents/**` and one own skill, at the user's explicit request.
     Root CLAUDE.md "Do not touch" covers only vendored `.claude/skills/**`, `skills-lock.json` and
     `.claude/pr-self-review/waivers.json` — none of them is touched. Implementers may not edit `.claude/**`
     (implementer-protocol §3.3), so the MAIN SESSION executes this plan (see Global constraints). -->

- **Status:** done (approved 2026-11-06; W0–W3 done; next: user runs `/pr-self-review`)
- **Goal:** The user can run four new project subagents: `test-writer` (writes UI and backend tests, only test files), `architecture-reviewer` (read-only, boundary findings with evidence), `plan-verifier` (read-only, checks code against every plan item and spec acceptance criterion with fresh evidence) and `doc-writer` (turns a plan, spec or code into package docs with Mermaid diagrams, only doc files). Hooks enforce what each agent may write, and `/implement-plan` runs the two verifiers before it marks a plan `done`.
- **Specs:** none (tooling, not a product feature), see Goal. The rules come from the files and URLs in § Sources.
- **Packages:** none of the four product packages in W0–W2. Touched: `.claude/agents/**`, `.claude/skills/implement-plan/SKILL.md`. The W3 smoke run writes test and doc files into `client/` and `server/` (see T7).
- **Out of scope:**
  - e2e flows (`e2e/specs/*.flow.json`) in `test-writer`. It covers `client/`, `server/` and `reviewer-core/` only.
  - A `[tests]` / `[docs]` task type in `plans/TEMPLATE.md`, the planner or `implementer-protocol`. Plan tasks keep writing their own tests.
  - New own skills. So `routing.json` → `ownSkills` and `.claude/skills/README.md` stay unchanged.
  - Changes to `plans-only-write.mjs` (its fail-open on bad input stays). The self-test only adds regression cases for it.
  - Editing `.claude/settings.json`. Hooks go into agent frontmatter, as `planner.md` does.
  - Root `CLAUDE.md`/`AGENTS.md` and `TESTING.md` text, plus a CI job for the hook self-test.
  - Mutation testing (Stryker) and an ADR folder.
  - `docs/agent-prompts/**`. The DB is its source of truth (`docs/agent-prompts/README.md`).
  - Replacing `/pr-self-review`. It stays the code-quality and security gate. The new reviewers check architecture and plan compliance only.

## Global constraints

- **Executor = main session, task by task.** This plan does not go through `/implement-plan`, for two reasons. `implementer-protocol` §3.3 forbids `.claude/**`, and `/implement-plan` §0.2 accepts only `[backend]|[frontend]` tasks. Task type `[main]` marks this. Wave order and file ownership still apply.
- **Do not touch:** vendored `.claude/skills/**` (the only skill edited is own `implement-plan`, already in `ownSkills`), `skills-lock.json`, `.claude/pr-self-review/waivers.json`, `*/src/vendor/shared/**`, `server/src/db/migrations/**`, `server/clones/**`, lockfiles, any `INSIGHTS.md`. `checks.mjs` enforces the vendored-skill rule (`.claude/skills/pr-self-review/scripts/checks.mjs:96` → `policy/vendored-skill-edited`).
- **Rules are referenced, not copied** (`.claude/agents/README.md` → Conventions). Agent prompts point to `CLAUDE.md`, `INSIGHTS.md`, `TESTING.md` and skill sections by path. No dated INSIGHTS entry is pasted into an agent file. A rule that must hold goes into a hook, not just a prompt.
- **Hooks:** Node `.mjs` with no dependencies, wired in frontmatter as `node "$CLAUDE_PROJECT_DIR/.claude/agents/hooks/<file>.mjs" <profile>`. Exit 2 plus a stderr message blocks the call. Paths are normalized like `plans-only-write.mjs` does it (`\`→`/`, lowercase, resolved against `CLAUDE_PROJECT_DIR`). The new hooks **fail closed**: bad JSON, a missing field or an unknown profile all exit 2.
- **The Bash guard is a heuristic.** The tool allowlist is the hard limit. Per the Claude Code docs a Bash PreToolUse hook can be bypassed. `.claude/agents/README.md` must say "hook (heuristic)" for Bash limits and "enforced" only for tool allowlists and the Write/Edit hook.
- **Frontmatter keys** must be exactly from the documented set: `name, description, tools, disallowedTools, model, permissionMode, maxTurns, skills, hooks, memory, effort, isolation, omitClaudeMd, mcpServers, background, color`. Unknown keys are ignored silently. Don't use `permissionMode: plan` as a read-only control, because a parent in bypass/acceptEdits/auto mode overrides it. Don't list `PowerShell` in any new agent's `tools`, because the guard matches `Bash` only (`.claude/settings.json` shows both shell tools exist).
- **Subagents never write** `INSIGHTS.md`, `plans/**` or task `Status:` lines. The root `CLAUDE.md` Session protocol does not apply to them (same precedence as `implementer-protocol` §0). They return `INSIGHT CANDIDATES` and the caller records them via `engineering-insights`.
- **Missing skill ⇒ BLOCKED.** Claude Code skips a missing `skills:` entry silently. Every agent that has skills checks that they are in its context and returns `BLOCKED: skill <name> not injected` if one is missing.
- Agent definitions load at session start. After any edit to `.claude/agents/*.md`, run `/clear` (or restart) before invoking the agent.
- Windows: call bins via `node node_modules/...`, never `pnpm <script>` (`plans/README.md` → Verify commands). The repo path contains spaces, so quote every path in commands.
- The `.claude/` Verify commands below are new. `plans/README.md` → Verify commands has no row for `.claude/`. Package checks in T7 are copied from that table.

## Contracts (Wave 0)

### C1 — hook CLIs (owned by T0)

```text
node .claude/agents/hooks/write-scope.mjs <profile>     profile ∈ { tests, docs }
  stdin : PreToolUse JSON; reads tool_input.file_path (Write, Edit)
  exit 0: path allowed · exit 2: blocked, stderr = "Blocked (write-scope <profile>): <rel path> — allowed: <globs>. Report what you needed instead."
  Order: outside project root → block; DENY globs → block; profile ALLOW globs → allow; else block.
  DENY (all profiles): **/vendor/**, **/node_modules/**, server/clones/**, server/src/db/migrations/**,
        **/INSIGHTS.md, **/CLAUDE.md, **/AGENTS.md, plans/**, .claude/**, docs/**, **/pnpm-lock.yaml,
        **/package-lock.json, **/.env*
  ALLOW tests: client/src/**/*.test.ts, client/src/**/*.test.tsx, client/src/test/**/*.ts, client/src/test/**/*.tsx,
        server/test/**/*.ts, server/src/**/*.test.ts, reviewer-core/test/**/*.ts, reviewer-core/src/**/*.test.ts
  ALLOW docs : README.md, TESTING.md, {server,client,reviewer-core,e2e}/README.md,
        {server,client,reviewer-core,e2e}/docs/**/*.md, server/src/modules/*/README.md
        (+ {server,client,reviewer-core}/specs/**/*.md ONLY if Open question 3 is answered "yes")

node .claude/agents/hooks/bash-guard.mjs <profile>      profile ∈ { review, verify, tests, docs }
  stdin : PreToolUse JSON; reads tool_input.command
  exit 0: every segment allowed · exit 2: stderr = "Blocked (bash-guard <profile>): \"<segment>\" is not allowed. Allowed: <summary>. Use Read/Grep/Glob or ask the caller to run it."
  Tokenizer: respects '…', "…" and backslash escapes; operators inside quotes are literal.
  Reject anywhere (unquoted): $( · ` · <( · >( · a single & (background) · VAR=value prefix ·
        > or >> or &> unless the target is /dev/null or an fd dup (2>&1, >&2) ·
        any token matching (^|/)\.env (except .env.example) or clones/.*\.git
  Split segments at unquoted && || ; | and newline; EVERY segment must match the profile:
  READ (all profiles): cd <path> · pwd · ls · cat · head · tail · wc · grep · sort · uniq · echo ·
        find (no -exec -execdir -ok -okdir -delete -fprint -fprintf -fls) ·
        git [-C <path>] [--no-pager] {diff|log|show|status|rev-parse|merge-base|blame|ls-files|grep}
            (no --output / --output=…) · git branch --show-current
  review = READ + node <…>scripts/check-architecture.mjs [--base <file>]   (no --update, no --self-test)
                + node <…>node_modules/dependency-cruiser/bin/dependency-cruise.mjs  (no --output-to, -f, --init)
  verify = review + node <…>node_modules/typescript/bin/tsc … (must contain --noEmit)
                  + node <…>node_modules/vitest/vitest.mjs run …  (no -u --update -w --watch --coverage --ui)
  tests  = verify
  docs   = READ

node .claude/agents/hooks/self-test.mjs
  exit 0: "✔ hooks self-test: <n> hook cases, <m> agent files"   exit 1: "✖ …" + one line per failure
```

### C2 — agent frontmatter (exact; T1–T4 own their file, T5 documents it)

```yaml
# .claude/agents/test-writer.md (T1)
name: test-writer
description: Writes or extends automated tests for existing DevDigest code — client/ UI (Vitest + React Testing Library, jsdom), server/ (Vitest unit, app.inject route tests, Postgres-backed *.it.test.ts via testcontainers) and reviewer-core/ (engine tests with a stubbed LLM). Input is the target production file(s), optionally behaviours to cover or a spec whose acceptance criteria become tests. Writes ONLY test files and test helpers (enforced by a hook), proves every new test can fail, runs it, and reports a bug it finds as a failing test instead of changing production code. Not for e2e flows and not for plan tasks (implementers write those tests).
model: sonnet
maxTurns: 60
tools: Read, Grep, Glob, Edit, Write, Bash
disallowedTools: Agent, Skill
skills:   # = skills routing.json applies to test files + per-ring testing guidance (keep in sync)
  - react-testing-library
  - onion-architecture
  - fastify-best-practices
  - typescript-expert
  - zod
  - security
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/write-scope.mjs\" tests", timeout: 10 }]
    - matcher: "Bash"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/bash-guard.mjs\" tests", timeout: 10 }]

# .claude/agents/architecture-reviewer.md (T2)
name: architecture-reviewer
description: Read-only architecture review of a DevDigest change set (git range or working tree). Checks server Onion rings plus the dependency-cruiser layer check, client layering and import direction (frontend-ui-architecture), cross-package boundaries (vendor/shared, reviewer-core purity, tsconfig aliases) and workspace scoping. Every finding has a rule id, file:line, confidence ≥ 80 and evidence (checker output or a quoted line); baseline/pre-existing violations are listed apart. No Write/Edit; Bash limited by a hook to read-only git and the layer checker. Not a code-quality or security review (that is /pr-self-review).
model: sonnet
maxTurns: 40
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent, Skill
skills:
  - onion-architecture
  - frontend-ui-architecture
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/bash-guard.mjs\" review", timeout: 10 }]

# .claude/agents/plan-verifier.md (T3) — no skills on purpose: compliance, not generic advice
name: plan-verifier
description: Verifies finished code against EVERY item of a Development Plan (plans/<feature>.md) and the acceptance criteria of the specs it links. It builds a requirement inventory with IDs (global constraints, out-of-scope, contracts, each task's acceptance criteria and Verify commands, spec criteria), maps each one to code evidence (path:line), the test that asserts it and FRESH command output, checks the file ownership map against the git diff, and reports coverage with a COMPLIANT / NOT COMPLIANT / INCOMPLETE EVIDENCE verdict. Never trusts task statuses or implementer reports and never adds generic code advice. Read-only: no Write/Edit, Bash limited by a hook to git, typecheck, vitest and the layer check. Launched by /implement-plan at Finish, or manually with a plan path.
model: opus
effort: high
maxTurns: 80
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent, Skill
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/bash-guard.mjs\" verify", timeout: 10 }]

# .claude/agents/doc-writer.md (T4)
name: doc-writer
description: Documents implemented DevDigest features. Turns a finished plan (plans/<feature>.md), a spec, code paths or notes into package documentation with Mermaid diagrams, grounded in the code (path:line → symbol). Knows where each kind of content goes (package README = canonical overview, <pkg>/docs/<topic>.md + its index line = how it works, TESTING.md = tests/CI) and never writes INSIGHTS, plans, specs, CLAUDE.md, docs/agent-prompts or code (enforced by a hook). Reports discrepancies between plan/spec and code instead of papering over them.
model: sonnet
maxTurns: 40
tools: Read, Grep, Glob, Edit, Write, Bash
disallowedTools: Agent, Skill
skills:
  - mermaid-diagram
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/write-scope.mjs\" docs", timeout: 10 }]
    - matcher: "Bash"
      hooks: [{ type: command, command: "node \"$CLAUDE_PROJECT_DIR/.claude/agents/hooks/bash-guard.mjs\" docs", timeout: 10 }]
```

In the real files, write `hooks:` in the block style of `planner.md`. The inline `[{…}]` above is only to keep this plan short.

### C3 — input and report contracts (T1–T4 implement them; T6 consumes C3.2/C3.3)

```text
C3.1 test-writer
  input : target: <path>[, <path>…]   (required; production files or a folder)
          focus: <behaviours>          (optional)
          spec: <pkg>/specs/<f>.md     (optional; its Acceptance criteria become tests)
  report: STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
          TARGET: <paths> · mode: cover | from-spec <path>
          FILES: <path> (new|modified), …
          BEHAVIOURS: <behaviour> → <test file>:<line> "<test name>"            (one per line)
          RED CHECK: <test name> → <assertion inverted/removed> → failed as expected | did NOT fail (rewritten)
          RUN: `<command>` → <actual result>
          SHUFFLE: `<command> --sequence.shuffle` → <result>
          TYPECHECK: `<command>` (cwd <pkg>) → <n> errors (<n> in your files)
          BUGS FOUND: <failing test> · <production path:line> · expected <x>, got <y> | none
          NEEDS PRODUCTION CHANGE: <missing mock/port/export/accessible name + file> | none
          BLOCKER: <only if BLOCKED>
          INSIGHT CANDIDATES: <fact, path:line → symbol> | none

C3.2 architecture-reviewer
  input : base: <ref>      (optional; default origin/main if `git rev-parse --verify origin/main` succeeds, else main)
          head: <ref>      (optional; default = working tree: committed + staged + unstaged + untracked)
          scope: <paths>   (optional) · plan: plans/<f>.md (optional; its Global constraints add boundaries)
  report: VERDICT: PASS | FAIL                                (FAIL ⇔ ≥ 1 critical or high finding)
          SCOPE: <base>..<head|working tree> · <n> files (server a · client b · reviewer-core c · e2e d · other e)
          CHECKS RUN: `<command>` → exit <code> · <summary line verbatim>
          FINDINGS: (confidence ≥ 80, on a changed line; "none" if empty)
            - [critical|high|medium|low] <rule-id> · <path>:<line> · confidence <80–100>
              evidence: <checker key rule|from|to, or ≤ 3 quoted lines>
              rule: <skill § / CLAUDE.md section that states it>
              fix: <good shape — onion-architecture/examples.md § or frontend-ui-architecture §>
          PRE-EXISTING: <rule-id path> per line (baseline/legacy, not blocking) | none
          UNVERIFIED: <claim, confidence < 80> per line | none
          NOT CHECKED: <what + why> | nothing
  rule-id ∈ dependency-cruiser rule names (server/.dependency-cruiser.cjs) · onion/rule-<1..10>
          (onion-architecture "Hard rules") · server/workspace-scope · server/repo-intel-facade ·
          server/secrets-via-container · ui-arch/§<n> (frontend-ui-architecture section) ·
          pkg/vendor-shared · pkg/reviewer-core-io (reviewer-core/CLAUDE.md "NO I/O") · pkg/cross-package-import
  severity = .claude/skills/pr-self-review/references/severity-rubric.md (one scale for the repo)

C3.3 plan-verifier
  input : plan: plans/<f>.md (required) · base: <ref> (default HEAD = uncommitted plan work, the /implement-plan case)
          head: <ref> (default working tree) · task: T<n> (optional: only that task + Global constraints + its Contracts)
          run: unit | all (default unit; all = also *.it.test.ts, one file per command, needs Docker)
  report: VERDICT: COMPLIANT | NOT COMPLIANT | INCOMPLETE EVIDENCE
          PLAN: <path> · Status <value> · base <ref> · head <ref|working tree>
          COVERAGE: <met>/<total> met (<pct>%) · partial <n> · not met <n> · violated <n> · unverifiable <n>
          REQUIREMENTS: | ID | Source (plan § or spec path:line) | Requirement (≤ 1 line) | Status | Evidence |
          OWNERSHIP: unplanned: <path> … | missing: <path> … | none
          SPEC ↔ PLAN: spec criterion without task: <spec path:line> … | task without requirement: T<n> … | none
          COMMANDS RUN: `<command>` (cwd) → exit <code> · <summary line verbatim>
          NOT RUN: <command — reason> | none
  IDs   : G<n> Global constraint bullet · O<n> Out-of-scope bullet · C<n> Contracts item · T<n>.AC<m> ·
          T<n>.V<m> Verify command · S:<pkg>/<file>.AC<m> spec criterion (order of appearance)
  Status: MET · PARTIAL · NOT MET · VIOLATED (an O/G item broken) · UNVERIFIABLE (say how to check)
  Verdict: NOT COMPLIANT ⇔ any NOT MET / VIOLATED / unplanned file; else INCOMPLETE EVIDENCE ⇔ any
          UNVERIFIABLE or a Verify command NOT RUN; else COMPLIANT.

C3.4 doc-writer
  input : from: <plans/<f>.md | <pkg>/specs/<f>.md | code paths | free text>  (required, one or more)
          topic: <kebab-name> (optional) · packages: <list> (optional; default = packages the source touches)
  report: STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
          FILES: <path> (new|modified) — <sections>, …
          DIAGRAMS: <file> § <heading> — <mermaid type> (<n> nodes)
          SOURCES: <doc file § heading> ← <plan/spec/code path:line>, …
          DISCREPANCIES: <source says X (path) · code does Y (path:line) → documented Y> | none
          SUGGESTIONS (not written): <CLAUDE.md "Read when" line / INSIGHTS candidate / spec fix> | none
          NOT DOCUMENTED: <what + why> | none
```

## File ownership map

| File | Task | New / Modified |
|---|---|---|
| `.claude/agents/hooks/write-scope.mjs` | T0 | new |
| `.claude/agents/hooks/bash-guard.mjs` | T0 | new |
| `.claude/agents/hooks/self-test.mjs` | T0 | new |
| `.claude/agents/test-writer.md` | T1 | new |
| `.claude/agents/architecture-reviewer.md` | T2 | new |
| `.claude/agents/plan-verifier.md` | T3 | new |
| `.claude/agents/doc-writer.md` | T4 | new |
| `.claude/agents/README.md` | T5 | modified |
| `.claude/skills/implement-plan/SKILL.md` | T6 | modified |
| `client/src/lib/github-urls.test.ts` | T7 | new (written by test-writer) |
| `server/test/skills-name-rules.test.ts` | T7 | new (written by test-writer) |
| `server/docs/conventions.md` | T7 | new (written by doc-writer) |
| `server/docs/README.md` | T7 | modified (index line, by doc-writer) |
| `server/src/modules/skills/arch-probe.ts` | T7 | temporary probe, deleted before T7 ends |

## Tasks

### T0 [W0] [main] Hooks + self-test
- **Status:** done
- **Files (only these):** `.claude/agents/hooks/write-scope.mjs`, `.claude/agents/hooks/bash-guard.mjs`, `.claude/agents/hooks/self-test.mjs`
- **Depends on:** —
- **Produces:** C1 exactly.
- **Insights:**
  - `2026-11-04 — On Windows pnpm <script> can fail with "Access is denied" → call bins via node: node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json, node node_modules/vitest/vitest.mjs run … (package.json → scripts).` (server/INSIGHTS.md:34). The guard allows `node <…>node_modules/<bin>`, never `pnpm`/`npm`/`npx`.
- **Skill focus:** security (fail closed; deny before allow; path traversal via `..` and absolute paths outside the root); typescript-expert (plain ESM `.mjs`, no deps).
- **Steps:**
  1. `write-scope.mjs`: copy the stdin/path normalization of `plans-only-write.mjs`, then implement C1 order (root check → DENY → ALLOW). Glob→RegExp: `**/` = zero or more dirs, `*` = no `/`, `{a,b}` = alternation. The header comment names the profiles and says the hook fails closed.
  2. `bash-guard.mjs`: quote-aware tokenizer, global rejects, segment split, per-profile matchers as in C1. The header comment quotes the docs caveat (heuristic, bypassable; the tool allowlist is the real limit).
  3. `self-test.mjs`: run each hook with `spawnSync(process.execPath, [hook, profile], { input, env: { …process.env, CLAUDE_PROJECT_DIR: <repo root> } })` over a case table, and assert the exit code. Required cases:
     - write-scope `tests` allows `client/src/lib/github-urls.test.ts`, `server/test/helpers/pg.ts`, `reviewer-core/test/prompt.test.ts`, `server/src/modules/skills/x.test.ts`, `client/src/test/setup.ts`, and an absolute Windows-style path (`F:\…\server\test\a.test.ts`) under the root. It blocks `client/src/lib/github-urls.ts`, `server/src/adapters/mocks.ts`, `client/src/vendor/ui/kit/x.test.tsx`, `server/INSIGHTS.md`, `plans/x.md`, `../outside.test.ts`, an unknown profile and malformed JSON.
     - write-scope `docs` allows `server/docs/conventions.md`, `server/docs/README.md`, `client/README.md`, `README.md`, `TESTING.md`, `server/src/modules/repo-intel/README.md`. It blocks `server/specs/x.md` (flip if OQ3 = yes), `docs/agent-prompts/general-reviewer.md`, `server/INSIGHTS.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/agents/README.md`, `server/docs/x.ts`, `server/src/app.ts`.
     - bash-guard `review` allows `git diff main...HEAD --name-status`, `cd "F:/a b/server" && node scripts/check-architecture.mjs`, `git status --porcelain 2>&1 | head -50`, `grep -n "a|b && c" README.md`, `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs src --output-type err`. It blocks `node scripts/check-architecture.mjs --update`, `… --self-test`, `git checkout main`, `echo x > a.txt`, `cat .env`, `cat server/clones/r/.git/config`, `rm -rf x`, `node -e "1"`, `npx vitest run`, `git diff --output=x.patch`, `ls $(pwd)`, `find . -delete`, `sleep 1 &`.
     - bash-guard `verify` allows `cd server && node node_modules/vitest/vitest.mjs run test/a.test.ts` and `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`. It blocks `node node_modules/vitest/vitest.mjs run -u`, `node node_modules/typescript/bin/tsc -p tsconfig.json`, `npm run e2e:hermetic`.
     - bash-guard `tests` allows `node node_modules/vitest/vitest.mjs run --sequence.shuffle src/lib/a.test.ts`. `docs` blocks `node node_modules/vitest/vitest.mjs run` and allows `git log --oneline -5`.
     - `plans-only-write.mjs` (unchanged, regression): allows `plans/x.md`, blocks `plans/sub/x.md` and `server/a.ts`.
  4. Frontmatter lint in `self-test.mjs`, for every `.claude/agents/*.md` except `README.md`, using a line-based parse (top-level `key:` lines, `skills:` list items, `#` comments ignored). Checks:
     - keys ⊆ the documented set (Global constraints);
     - `name` = file basename;
     - each skill has `.claude/skills/<name>/SKILL.md` without `disable-model-invocation: true`;
     - each hook command's `$CLAUDE_PROJECT_DIR/<path>` exists, and a write-scope/bash-guard profile argument is a known profile;
     - an agent with a bash-guard hook has no `PowerShell` in `tools`.
- **Acceptance criteria:**
  - [ ] `node .claude/agents/hooks/self-test.mjs` exits 0 and lints the 4 existing agent files (`planner`, `researcher`, `implementer-backend`, `implementer-frontend`) with no failures.
  - [ ] Changing one expected exit code in the case table makes the self-test exit 1 and name the case (proves it can fail; revert afterwards).
  - [ ] Every block message names the profile and the offending path or segment.
  - [ ] No file imports anything outside `node:` built-ins.
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` (repo root) → exit 0, `✔ hooks self-test: …`

### T1 [W1] [main] `test-writer` agent
- **Status:** done
- **Files (only these):** `.claude/agents/test-writer.md`
- **Depends on:** T0
- **Produces:** C2 test-writer frontmatter + C3.1.
- **Insights** (the prompt must point to the place, not paste the line):
  - client:10 `To vary data a vi.mock-ed hook returns per test, never mutate the module-level fixture … verify with vitest run --sequence.shuffle (…RunTraceDrawer.test.tsx:24 → currentTrace).`
  - client:21 `Gallery (src/components/showcase/Showcase.tsx) is rendered by src/test/smoke.test.tsx with NO NextIntlClientProvider → components added to /showcase must not call useTranslations …`
  - client:23 `Kit Checkbox is a <button role="checkbox"> inside a <label> and Toggle is a role="switch" button with NO label prop → in RTL query getByRole('checkbox') scoped within(row) / getByRole('switch') …`
  - client:41 `Modals rendered at the top of a view come BEFORE the page in the DOM, so getAllByRole(...)[last] picks the page button; scope with within(getByRole("dialog")) (ConventionsView.test.tsx).`
  - server:46 `CORRECTION … (indexer-pipeline ENOENT): fixed — … all 131 server unit tests pass on Windows → a failure there is now a real regression …` (supersedes server:42).
  - server:66 `Integration tests intermittently skip (Docker not available) or fail when the full suite runs in parallel … consider … running .it.test.ts files sequentially.`
  - reviewer-core:17 `test/run.test.ts imports MockLLMProvider/MockGitClient from ../../server/src/adapters/mocks.js …`
  - reviewer-core:24 and :25 `npm run typecheck checks only src/**/*.ts … type errors in test/*.ts never fail …` / `… 2 PRE-EXISTING TS7006 … in test/run.test.ts:111/:142 … treat them as the baseline`.
- **Skill focus:** react-testing-library (query priority, `userEvent.setup()`, no implementation details). **Package conventions beat the generic skill:** client tests `vi.mock` the hook modules, with no MSW (`client/CLAUDE.md` → Commands). Server tests swap dependencies via `ContainerOverrides`, not `vi.mock` (`onion-architecture/references/testing.md` → Rules).
- **Steps:** Write the frontmatter exactly as in C2. The body (≤ 160 lines) has these sections:
  1. **Precedence:** Session protocol not applied, no INSIGHTS writes.
  2. **Input:** C3.1, and the missing-skill `BLOCKED` check.
  3. **Before writing:** read the target package's `CLAUDE.md` and `TESTING.md` (Philosophy, Conventions). Grep the package `INSIGHTS.md` for the target's folder and read "What Doesn't Work" and "Recurring Errors & Fixes" in full (same method as `implementer-protocol` §2.3). Open the target and the nearest existing tests and copy their setup (`client/src/lib/hooks/skills.test.tsx` QueryClient wrapper, `server/test/helpers/`, `reviewer-core/test/run.test.ts`).
  4. **Where tests go** (pointers only): `client/CLAUDE.md` → Conventions (`<Name>.test.tsx` next to the component, `src/lib/<x>.test.ts`); `server/CLAUDE.md` → Naming (`test/<area>-<topic>.test.ts`, DB ⇒ `*.it.test.ts`); `reviewer-core/CLAUDE.md` → Naming (`test/<src-file-name>.test.ts`).
  5. **What to test:** use cases, not lines (`TESTING.md` Philosophy). One happy path plus the edge that matters. No tests for impossible cases. A fresh `QueryClient` per test with `retry: false` (TanStack testing guide). LLM, GitHub and git are mocked via `server/src/adapters/mocks.ts`. No snapshot tests unless asked. No `.only`/`.skip` left behind.
  6. **Work loop:**
     1. Write the tests.
     2. Run the new files.
     3. **RED check per test:** invert or remove the key assertion, run, see it fail, restore (the test file only).
     4. `--sequence.shuffle` run of the new files.
     5. Typecheck the package. For reviewer-core, note that tests are not type-checked.
     6. At most one fix attempt per failure.
  7. **A real bug** (the test fails because production is wrong): handle it per Open question 2 (default: keep the failing test and report `BUGS FOUND`). Never edit production code (the hook blocks it). A missing seam goes to `NEEDS PRODUCTION CHANGE`.
  8. **Hard rules:** Do-not-touch, no install, no git writes, no e2e.
  9. **Report:** C3.1.
- **Acceptance criteria:**
  - [ ] Frontmatter equals C2, and the self-test lints the file clean.
  - [ ] The body contains the RED check step, the shuffle step, the bug policy and the C3.1 report block verbatim.
  - [ ] No pasted INSIGHTS entry: `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/test-writer.md` → 0.
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` → exit 0 (agent files count includes `test-writer`)
  - `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/test-writer.md` → `0`

### T2 [W1] [main] `architecture-reviewer` agent
- **Status:** done
- **Files (only these):** `.claude/agents/architecture-reviewer.md`
- **Depends on:** T0
- **Produces:** C2 architecture-reviewer frontmatter + C3.2.
- **Insights:**
  - server:13 `options.exclude in .dependency-cruiser.cjs removes the module AND all edges to it … prove rules with node scripts/check-architecture.mjs --self-test (.dependency-cruiser.cjs → options.doNotFollow).` A change to rules or the checker → `NOT CHECKED` plus "run `--self-test`" (the guard blocks it for the reviewer).
  - server:22 `Correction: … the check is now node scripts/check-architecture.mjs … legacy violations frozen in architecture-baseline.json, which may only shrink …` (supersedes server:21).
  - server:44 `The PR #12 review claimed @devdigest/shared resolves to node_modules/@devdigest/shared — false: tsconfig paths resolves it to src/vendor/shared/index.ts … verify reviewer claims with a probe file before applying their suggested fix (tsconfig.json → paths).` The reviewer cannot write probes, so a resolution claim needs the `tsconfig.json` `paths` it read plus depcruise output, or it goes to `UNVERIFIED`.
  - server:24 and :47: any edit under `*/src/vendor/shared/**` is a non-waivable pr-self-review BLOCK → rule `pkg/vendor-shared`, severity critical.
  - server:26 `Rules shared by two modules go to modules/_shared/ (allowed by no-cross-module-imports) …`, so this is not a finding.
  - server:18 `There is no base-repository/workspace guard; scoping is manual per query …` → `server/workspace-scope`.
  - server:19 `ReviewService builds new ReviewRepository(container.db) …` (legacy, PRE-EXISTING unless the diff adds the same pattern).
  - client:20 `SSE uses new EventSource(API_BASE + '/runs/:id/events') in hooks/reviews.ts — the one sanctioned bypass of api.ts …`, so this is not a finding.
  - client:19 `RepoIntelState in src/lib/hooks/repo-intel.ts is a deliberate local type …`, so this is not a finding.
- **Skill focus:** onion-architecture (ring table, "Reviewing a backend PR" workflow, baseline semantics); frontend-ui-architecture §1/§9/§10 (import direction, barrels, anti-patterns).
- **Steps:** Write the frontmatter exactly as in C2. The body (≤ 160 lines) has these sections:
  1. **Read-only, never fix.** Don't search inside `server/clones/` and never open `.env*` (researcher rule 3).
  2. **Input:** C3.2, and the missing-skill check.
  3. **Collect scope:** `git diff --name-status <base>[...<head>]`, plus `git status --porcelain` for untracked files when head = working tree. Ignore `**/*.md`, generated migrations and lockfiles. A vendor/shared edit is reported, not ignored.
  4. **Deterministic first:** if `server/src/**` changed, run `cd server && node scripts/check-architecture.mjs`. Each line under "NEW layer violations" becomes a finding with the checker rule id, confidence 100 and the key `rule|from|to` as evidence. "fixed since baseline" lines are noted as a suggestion to run `--update`. If head ≠ working tree, the checker result goes to `NOT CHECKED` because it reflects the working tree only.
  5. **What the checker can't see,** per changed file:
     - server: onion "Hard rules" 1–10 and `server/CLAUDE.md` → Conventions (workspace filter, repo-intel facade, secrets via container, container getters);
     - client: frontend-ui-architecture §1, §2 row 1, §8, §9, §10;
     - cross-package: `reviewer-core/CLAUDE.md` Hard rules ("NO I/O"), vendor/shared, relative imports crossing a package root instead of a tsconfig alias.
     - Before flagging, check `onion-architecture/examples.md` § Known violations and the package INSIGHTS "Codebase Patterns" for sanctioned exceptions.
  6. **Validate every finding** (code-review plugin pattern): re-open the file at the cited line and assign confidence 0–100. Below 80 → `UNVERIFIED`. Not on a changed line → `PRE-EXISTING`.
  7. **Severity:** `pr-self-review/references/severity-rubric.md`.
  8. **Not a finding:** style, naming, performance, security beyond workspace scoping, test quality — all of these belong to `/pr-self-review`. Don't invent findings. "PASS with no findings" is a valid result.
  9. **Report:** C3.2.
- **Acceptance criteria:**
  - [ ] Frontmatter equals C2 (no Write/Edit, Bash guarded by `review`), and the self-test lints it clean.
  - [ ] The body names every rule-id family from C3.2 with the file that defines it, and contains the confidence ≥ 80 filter and the re-validation step.
  - [ ] `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/architecture-reviewer.md` → 0.
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` → exit 0
  - `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/architecture-reviewer.md` → `0`

### T3 [W1] [main] `plan-verifier` agent
- **Status:** done
- **Files (only these):** `.claude/agents/plan-verifier.md`
- **Depends on:** T0
- **Produces:** C2 plan-verifier frontmatter + C3.3.
- **Insights:**
  - server:34 (Windows bins via `node`, see T0). The verifier runs Verify commands exactly as `plans/README.md` lists them.
  - server:66 (integration tests flaky in parallel) → with `run: all`, each `*.it.test.ts` file runs in its own command. "Docker not available" skips → `NOT RUN`, not MET.
  - reviewer-core:24 (`tsc` does not check `test/*.ts`): a "tests type-check" requirement is not proven by `npm run typecheck`.
  - e2e:36 `Unverified (agent-browser isn't installed on this box) …` → e2e flows are always `NOT RUN` with the reason, and their requirements are `UNVERIFIABLE` with the command to run.
- **Skill focus:** none injected on purpose. The rule most at risk is generic advice leaking in: a row without a requirement ID is not allowed.
- **Steps:** Write the frontmatter exactly as in C2. The body (≤ 160 lines) has these sections:
  1. **Read-only.** Never edit the plan or statuses, never fix.
  2. **Input:** C3.3.
  3. **Inventory:** read the plan in full and every spec it links in full, then assign IDs as in C3.3.
  4. **Diff:** changed + untracked files vs the File ownership map. Files generated for a migration task count for that task, as in `/implement-plan` §4.1.
  5. **Evidence per requirement:** code `path:line` (`git show <head>:<path>` when head ≠ working tree), the test that asserts it (file:line + name) and command output. Contracts are compared literally (names, fields, types, status codes).
  6. **Fresh commands:** every task Verify command plus the package typecheck. The recorded exit code and summary line come from this run, never from a report. If head ≠ working tree, run no commands and mark command-based requirements `UNVERIFIABLE (head ≠ working tree)`.
  7. **Spec ↔ plan cross-check:** spec criteria with no task, tasks with no requirement.
  8. **Verdict rules:** C3.3.
  9. **Discipline:**
     - Never trust `Status: done` or agent reports; check the diff.
     - No finding without a requirement ID. Style and quality advice goes to `/pr-self-review`.
     - Report MET plainly when the evidence exists.
  10. **Report:** C3.3.
- **Acceptance criteria:**
  - [ ] Frontmatter equals C2, the file has no `skills:` key, and the self-test lints it clean.
  - [ ] The body contains the ID scheme, the five statuses, the verdict rule and the "no finding without a requirement ID" rule verbatim from C3.3.
  - [ ] `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/plan-verifier.md` → 0.
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` → exit 0
  - `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/plan-verifier.md` → `0`

### T4 [W1] [main] `doc-writer` agent
- **Status:** done
- **Files (only these):** `.claude/agents/doc-writer.md`
- **Depends on:** T0
- **Produces:** C2 doc-writer frontmatter + C3.4.
- **Insights:** none in any `INSIGHTS.md` concern docs writing. Root `CLAUDE.md` → Knowledge files ("INSIGHTS only via engineering-insights") is a Global constraint.
- **Skill focus:** mermaid-diagram (right diagram type, clarity over decoration, labels quoted when they contain special characters).
- **Steps:** Write the frontmatter exactly as in C2. The body (≤ 160 lines) has these sections:
  1. **Precedence:** no INSIGHTS. The agent returns suggestions instead of editing `CLAUDE.md`.
  2. **Input:** C3.4, and the missing-skill check.
  3. **Research:** read the source, the target package `README.md`, `docs/README.md` and any existing doc on the topic (extend it, don't duplicate), then the code. Trust code over plan, spec and comments, and list each mismatch as `DISCREPANCIES`.
  4. **Routing table:**
     - overview, API map, env → `<pkg>/README.md` (canonical; edit only the affected section);
     - how implemented code works → `<pkg>/docs/<topic-kebab>.md` plus the index line `- [x.md](x.md) — read when …` in `<pkg>/docs/README.md`;
     - finished plan → docs of each touched package, linking the plan and specs, never copying task lists;
     - decisions → a "Decisions" section (Context · Decision · Consequences) in the relevant doc;
     - tests/CI → `TESTING.md` or `e2e/docs/`;
     - forbidden → INSIGHTS, plans, specs (unless OQ3), `docs/agent-prompts/**`, `CLAUDE.md`, code.
  5. **Style:** Diátaxis (docs/ = explanation/reference). Google style highlights: active voice, present tense, second person, short sentences. Code references `path:line → symbol` as in `server/docs/architecture.md`.
  6. **Diagrams:** mermaid-diagram type guide (flowchart for pipelines, sequenceDiagram for request flows, erDiagram for tables; C4 context/container level in READMEs, component level in docs). ≤ 15 nodes, labels use real symbol names. No local renderer exists, so GitHub renders them: re-read each diagram for syntax.
  7. **Report:** C3.4.
- **Acceptance criteria:**
  - [ ] Frontmatter equals C2, and the self-test lints it clean.
  - [ ] The body contains the routing table, including the forbidden row, and the index-line format.
  - [ ] `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/doc-writer.md` → 0.
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` → exit 0
  - `grep -cE "20[0-9]{2}-[0-9]{2}-[0-9]{2} —" .claude/agents/doc-writer.md` → `0`

### T5 [W2] [main] Agents map (`.claude/agents/README.md`)
- **Status:** done
- **Files (only these):** `.claude/agents/README.md`
- **Depends on:** T1, T2, T3, T4
- **Produces:** the updated map.
- **Insights:** none.
- **Steps:**
  1. **Pipeline:** add `test-writer` and `doc-writer` as manual entries, and the `/implement-plan` Finish step → `plan-verifier` + `architecture-reviewer` (per T6).
  2. **Roles table:** 4 rows (responsibility, input = C3.x input line, output = report header, launched by).
  3. **Model and permissions:** 4 rows. Write-scope hooks count as "enforced". The Bash guard counts as "hook (heuristic)", with a one-line legend under the table.
  4. **Injected skills:** add columns `test-writer`, `arch-reviewer` and `doc-writer`, plus a `mermaid-diagram` row. `plan-verifier` has none (note why).
  5. **Sync rules:** the test-writer set = what `routing.json` routes to test files (`react-testing-library`, `security`, `zod`, `typescript-expert`) + `onion-architecture`/`fastify-best-practices` for per-ring testing. The planner ⊇ test-writer set (it already holds). The union rule does not extend to reviewers or doc-writer.
  6. **Sources table:** add every row of § Sources of this plan that grounds a new agent.
  7. **Supporting files:** add the 3 hook files.
  8. **Conventions:** add "after editing an agent file or hook run `node .claude/agents/hooks/self-test.mjs`".
- **Acceptance criteria:**
  - [ ] Every new agent appears in the Roles, Model/permissions and Injected skills tables, and its frontmatter matches the table cells.
  - [ ] Every relative link in the file resolves to an existing path.
  - [ ] No rule text from agent files or skills is copied (the map links to them).
- **Verify:**
  - `node .claude/agents/hooks/self-test.mjs` → exit 0
  - `grep -o "](\([^)#]*\))" .claude/agents/README.md` → for each target, check with `ls` from `.claude/agents/` → all exist

### T6 [W2] [main] `/implement-plan` Finish gate
- **Status:** done
- **Files (only these):** `.claude/skills/implement-plan/SKILL.md`
- **Depends on:** T2, T3
- **Produces:** the new Finish behaviour, per Open question 4 (the default is described here).
- **Insights:**
  - client:35 `/pr-self-review caches findings per file+skill content … any client/INSIGHTS.md edit invalidates every client pair … finish INSIGHTS edits before the final review …` → in §7 the order is: insights (§6) → verifiers → `/pr-self-review` suggestion.
- **Skill focus:** keep the skill's style (numbered steps, no copied agent rules); `disable-model-invocation: true` stays.
- **Steps:**
  1. §0 Preflight: save `git rev-parse --short HEAD` as **plan base**. It is the `base:` already sent to wave 1, now named.
  2. §7 Finish, before setting `Status: done`: in ONE message launch `plan-verifier` (`plan:`, `base: <plan base>`, `run: unit`) and `architecture-reviewer` (`base: <plan base>`, `plan:`). Show both header blocks. Then:
     - `COMPLIANT` + `PASS` → set `Status: done`, offer `doc-writer` (`from: plans/<f>.md`) as optional, then tell the user to run `/pr-self-review`;
     - `NOT COMPLIANT` or `FAIL` → keep `in progress`, list the findings, and offer `--task T<n>` re-runs with the finding as `gate failure:`, or ask the user;
     - `INCOMPLETE EVIDENCE` → show `NOT RUN`/`UNVERIFIABLE` and ask the user to confirm the manual checks before setting `done`.
  3. Bump `metadata.version` to `1.1.0` and set `updated` to the execution date.
- **Acceptance criteria:**
  - [ ] §7 launches both verifiers in one message and never sets `done` on `NOT COMPLIANT`/`FAIL`.
  - [ ] Waves §1–§6 are unchanged apart from the plan-base line.
  - [ ] Only the own skill `implement-plan` changed under `.claude/skills/` (`git status --porcelain .claude/skills` shows one path).
- **Verify:**
  - `git status --porcelain .claude/skills` → exactly ` M .claude/skills/implement-plan/SKILL.md`

### T7 [W3] [main] Smoke run of the four agents
- **Status:** done with concerns (2026-11-06; test-writer report format deviates from C3.1 — see the first criterion)
- **Files (only these):** `client/src/lib/github-urls.test.ts`, `server/test/skills-name-rules.test.ts`, `server/docs/conventions.md`, `server/docs/README.md` (written by the agents); `server/src/modules/skills/arch-probe.ts` (temporary, created and deleted by the main session)
- **Depends on:** T5, T6
- **Produces:** evidence that each agent meets its contract.
- **Insights:**
  - client:10 (shuffle) — see T1.
  - server:44 (verify claims with a probe) — the reason for the temporary probe file.
- **Steps:**
  1. `/clear` (agent files load at session start).
  2. `@test-writer target: client/src/lib/github-urls.ts`, then `@test-writer target: server/src/modules/_shared/skill-name.ts` (the test file to write is `server/test/skills-name-rules.test.ts`).
  3. Create `server/src/modules/skills/arch-probe.ts` with `import { eq } from 'drizzle-orm'; export const probe = eq;`. Run `@architecture-reviewer base: main`, then delete the probe.
  4. `@plan-verifier plan: plans/run-cost-badge-dryrun.md base: 0e4375c^ head: 0e4375c`.
  5. `@doc-writer from: server/specs/conventions.md, server/src/modules/conventions/ topic: conventions`.
  6. Keep or discard the outputs per Open question 5.
- **Acceptance criteria:**
  - [ ] test-writer (PARTIAL 2026-11-06: tests, RUN, SHUFFLE, files OK; RED CHECK batched in one run, client skipped one test; BEHAVIOURS without file:line in the server report; extra TYPECHECK field. Fix: test-writer.md §6.3 one test per run + §9 format rules and self-check; TYPECHECK added to C3.1. Re-run 2026-11-06 after a full restart (`/clear` did not reload the agent): client RED-checked per test, 10/10 red, each mutation run separately; report used a table instead of C3.1 RED CHECK lines and left 2 scratch files in src/. Server report not re-run yet → tick after the server re-run): both reports follow C3.1, with a RED CHECK per test and a fresh RUN and SHUFFLE result. Only the two test files changed.
  - [x] architecture-reviewer: `VERDICT: FAIL` with an `application-no-drizzle` finding on `server/src/modules/skills/arch-probe.ts:1`, confidence 100, and the checker key as evidence. No finding below confidence 80 appears under FINDINGS.
  - [x] plan-verifier: `VERDICT: NOT COMPLIANT`. T1's contracts are `NOT MET`, with evidence that `server/src/modules/reviews/domain.ts` is absent at `0e4375c` and `UsageTally` sits in `server/src/modules/reviews/usage.ts`. `OWNERSHIP` lists `server/src/vendor/shared/contracts/platform.ts` and `server/src/modules/reviews/usage.ts` as unplanned. Command-based requirements are `UNVERIFIABLE (head ≠ working tree)`.
  - [x] doc-writer: `server/docs/conventions.md` has ≥ 1 Mermaid diagram and `path:line → symbol` references, `server/docs/README.md` gains one `- [conventions.md](conventions.md) — read when …` line, and the report lists SOURCES and DISCREPANCIES.
  - [x] After the run, `git status --porcelain` shows only paths from the ownership map (the probe is gone).
- **Verify:**
  - `cd client && node node_modules/vitest/vitest.mjs run src/lib/github-urls.test.ts` → all pass; the same with `--sequence.shuffle` → all pass
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/skills-name-rules.test.ts` → all pass
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node scripts/check-architecture.mjs` → `✔ no new layer violations` (after the probe is deleted)

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T0 | main session | `node .claude/agents/hooks/self-test.mjs` → exit 0 |
| W1 | T1, T2, T3, T4 | main session, any order (disjoint files) | self-test exit 0 with 8 agent files; date-grep 0 for each new agent |
| W2 | T5, T6 | main session, any order | T5 links resolve; T6 `git status` check |
| W3 | T7 | main session after `/clear` | all T7 criteria; then the user runs `/pr-self-review` (the `.mjs` hooks are routed to `security`) |

## Risks · Review focus

1. **Bash guard misfires** — false allows (quotes, `$(`, redirects) or false blocks (paths with spaces, `2>&1`, `grep "a|b"`) → T0 case table; T7 exercises it live.
2. **Silent frontmatter failures** — a key typo or missing skill is ignored, so an agent runs without its limits → T0 lint plus the missing-skill `BLOCKED` check in T1/T2/T4.
3. **Reviewers invent findings or give generic advice** ("will always find something") → T2 confidence filter + re-validation; T3 requirement-ID rule; checked by the T7 expectations.
4. **Rules copied into prompts drift** from INSIGHTS/skills → date-grep in T1–T4 Verify; T5 links instead of copying.
5. **The `/implement-plan` Finish gate can stall** (no Docker → `INCOMPLETE EVIDENCE`) → T6 asks the user instead of blocking forever.

## Open questions

**Resolved 2026-11-06 (user: "за рекомендаціями"):** OQ1 yes — Bash behind the allowlist hook · OQ2 keep the failing test, report `BUGS FOUND` · OQ3 no `specs/` for doc-writer · OQ4 `/implement-plan` §7 Finish only · OQ5 keep T7 outputs.

1. **Bash for the read-only reviewers.** (Recommended) give `architecture-reviewer` and `plan-verifier` Bash behind the `review`/`verify` allowlist hook (heuristic per the docs, but they can run the layer check, `git diff` and Verify commands themselves, which is "fresh evidence"). Alternative: `tools: Read, Grep, Glob` only (enforced). The caller would then paste the diff and command output, and plan-verifier could not produce fresh evidence.
2. **test-writer finds a real bug.** (Recommended) keep the failing test in the tree and report `BUGS FOUND`; the suite stays red until someone fixes the code. Alternatives: mark it `it.fails(...)` with a comment, or delete the test and only report.
3. **doc-writer and `specs/`.** (Recommended) no: specs say what to build and are written before implementation. Alternative: allow `{server,client,reviewer-core}/specs/**/*.md` for "current-behavior contract" specs like `reviewer-core/specs/review-engine.md`. This flips one ALLOW line in C1 and one self-test case.
4. **Where the verifiers plug in.** (Recommended) `/implement-plan` §7 Finish only, once per plan. Alternatives: after every wave (higher cost; W0 contracts would often read as NOT MET mid-plan) or manual only (T6 dropped).
5. **T7 smoke outputs** (`client/src/lib/github-urls.test.ts`, `server/test/skills-name-rules.test.ts`, `server/docs/conventions.md` + index line). (Recommended) keep them in the branch, since they are real coverage and docs. Alternative: delete them after reading the reports.

## Sources

Status: **internal** = read by the planner in this repo on 2026-11-06 · **via researcher** = from the 3 researcher reports of 2026-11-06, not re-read (the planner has no web tools).

| Source | Status | Rules it grounds | Where |
|---|---|---|---|
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | via researcher | frontmatter key set (unknown keys ignored); `disallowedTools` before `tools`; `permissionMode: plan` overridden by a bypass/acceptEdits/auto parent → allowlist is the control; `Bash(...)` in `disallowedTools` removes the whole tool → Bash narrowing only via a PreToolUse hook, which the docs call heuristic (redirects bypass it); omit `Agent` to forbid nesting; `skills:` injects full text, no inheritance, no `disable-model-invocation` skills | C1, C2, Global constraints, T0 lint |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | via researcher | give a runnable check + evidence (command + output); a reviewer told to find problems "will always find something" → no tests or findings for impossible cases; read-only reviewer via `tools: Read, Grep, Glob` is "enforced rather than requested" | C3 report fields, T2 §8, T3 §9, OQ1 |
| [Anthropic code-review plugin — confidence scoring](https://instagit.com/anthropics/claude-code/code-review-confidence-scoring-claude-code.md) (mirror; primary 404) | via researcher, secondary | confidence 0–100, filter < 80, re-validate each finding | C3.2, T2 §6 |
| [obra/superpowers — requesting-code-review](https://raw.githubusercontent.com/obra/superpowers/main/skills/requesting-code-review/SKILL.md) (community) | via researcher | crafted context + base/head SHA as reviewer input; severity tiers (mapped onto the repo's single rubric instead) | C3.2 input |
| [obra/superpowers — verification-before-completion](https://raw.githubusercontent.com/obra/superpowers/main/skills/verification-before-completion/SKILL.md) (community) | via researcher | "no completion claims without fresh verification evidence"; "don't trust agent reports, check the VCS diff"; check requirements line by line against the plan | T3 §4–§6, §9 |
| [obra/superpowers — subagent-driven-development](https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md) (community) | via researcher | spec-compliance verdict before code quality → plan-verifier separate from `/pr-self-review` | T3, T6 order |
| [obra/superpowers — test-driven-development](https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/SKILL.md) (community) | via researcher | watch the test fail (verify RED); assert real behaviour, not mocks | T1 §6 RED check |
| [github/spec-kit — /analyze](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md) (community) | via researcher | strictly read-only; requirement inventory with IDs; flag requirements with zero tasks AND tasks with no requirement; coverage % | C3.3, T3 §3, §7 |
| [github/spec-kit — /checklist](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/checklist.md) (community) | via researcher | tests the spec, not the implementation → not used as a substitute for plan-verifier | T3 scope |
| [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | via researcher | `err` reporter prints `error <rule>: <path>` → rule id + evidence | C3.2 rule ids, T2 §4 |
| [Kent C. Dodds — Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details) | via researcher | test behaviour the user sees, not internals | T1 §5 |
| [Testing Library — query priority](https://testing-library.com/docs/queries/about/#priority) · [user-event setup](https://testing-library.com/docs/user-event/intro/) | via researcher | role/label queries first; `userEvent.setup()` before render | T1 skill focus |
| [TanStack Query — testing](https://tanstack.com/query/latest/docs/framework/react/guides/testing) | via researcher | fresh `QueryClient` per test, `retry: false` | T1 §5 |
| [Vitest — sequence](https://vitest.dev/config/sequence) · [mocking](https://vitest.dev/guide/mocking.html) | via researcher | `--sequence.shuffle` exposes order dependence; `vi.mock` is hoisted | T1 §6, C1 `tests` profile |
| [Fastify — Testing guide](https://fastify.dev/docs/latest/Guides/Testing/) | via researcher (also linked from `onion-architecture/references/testing.md`) | route tests via `app.inject` | T1 skills (`fastify-best-practices`) |
| [Testcontainers — PostgreSQL module](https://node.testcontainers.org/modules/postgresql/) | via researcher | real Postgres per integration file (repo: `server/test/helpers/pg.ts`) | T1 §4, T3 `run: all` |
| [Stryker — vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) | via researcher | mutation testing is heavy → out of scope; the cheap RED check is an inference with no official source | Out of scope, T1 §6 |
| [Diátaxis](https://diataxis.fr/) · [C4 model](https://c4model.com/) · [arc42](https://arc42.org/overview) · [ADR](https://adr.github.io/) | via researcher | doc types per location; diagram levels per audience; "Decisions" section as ADR-lite (no ADR folder in the repo) | T4 §4–§6 |
| [GitHub — creating Mermaid diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) | via researcher | GitHub renders Mermaid in Markdown → no local renderer needed | T4 §6 |
| [Google developer style — highlights](https://developers.google.com/style/highlights) | via researcher | active voice, present tense, second person, short sentences | T4 §5 |
| no official source | decision (OQ2) | whether a test agent may edit production code → test files only | C1 `tests`, T1 §7 |
| `.claude/agents/README.md`, `planner.md`, `researcher.md`, `implementer-*.md`, `hooks/plans-only-write.mjs` | internal | map structure, "referenced, not copied", "prefer a hook", hook pattern, read-only Bash rule, secrets rule | all tasks |
| `.claude/skills/implement-plan/SKILL.md`, `implementer-protocol/SKILL.md` | internal | §0.2 task types, §4.1 ownership diff, §7 Finish; §0 precedence, §2.3 INSIGHTS by path, §3.3 `.claude/**` forbidden for implementers | Global constraints, T1, T3, T6 |
| `.claude/skills/pr-self-review/references/routing.json`, `severity-rubric.md`, `scripts/checks.mjs:96` | internal | skills routed to test files; one severity scale; vendored-skill policy | C2 skills, C3.2, Global constraints |
| `.claude/skills/onion-architecture/SKILL.md` + `references/testing.md`, `server/.dependency-cruiser.cjs`, `server/scripts/check-architecture.mjs` | internal | rings, hard rules 1–10, baseline semantics, checker output lines, test per ring, `ContainerOverrides` | T1, T2 |
| `.claude/skills/mermaid-diagram/SKILL.md`, `TESTING.md`, `<pkg>/CLAUDE.md`, `<pkg>/docs/README.md`, `<pkg>/specs/README.md`, `<pkg>/INSIGHTS.md`, `.claude/settings.json` | internal | diagram types; test philosophy; naming; index-line format; specs-before-code; per-task insights; `Bash\|PowerShell` gate | T1–T4, Global constraints |
