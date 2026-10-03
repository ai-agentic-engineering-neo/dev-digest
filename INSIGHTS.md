# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

This is the **root** file: it holds only findings that cross package boundaries.
Anything scoped to one package lives in that package's file —
[`client`](client/INSIGHTS.md) · [`server`](server/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

Roughly 5 entries per section. When an entry becomes stable reference material,
move it into `docs/` and delete it here. Sections are fixed — add to the one
that fits; never invent a new heading.

---

## Decisions

### 2026-10-02 — `spec-creator` write scope is a frontmatter PreToolUse hook, not prompt wording

**What:** `.claude/agents/spec-creator.md` (opus) is the only agent that writes
specs. Its `hooks:` frontmatter runs `.claude/hooks/spec-creator-guard.mjs` on
`Write|Edit|Bash`. `Write`/`Edit` are allowed only for a file named
`YYYY-MM-DD-<slug>.md` that sits directly in `specs/`, `server/specs/`,
`client/specs/`, `reviewer-core/specs/` or `mcp-server/specs/`. `Bash` is
allowed only for `date +%Y-%m-%d`, which the agent uses for the date-based
Spec ID.
Paths are canonicalised by running `realpath` on the deepest *existing*
ancestor, so a spec in a folder that doesn't exist yet still resolves, and
`specs/../server/x.md` is still caught. The script uses Node rather than shell
plus `jq`, because Node ≥22 is guaranteed by the stack and `jq` is not. It
replaced the 2026-10-01 `specreator` draft (global `SPEC-NN`, path-citing
specs) with a stricter WHAT-not-HOW agent.
**Why:** an agent that holds `Write` or `Bash` will eventually "just fix the
component too". A hook blocks that mechanically and tells the agent why. A hook
in the frontmatter applies only to this subagent, so nobody else is affected.
**Rejected:** a project-wide hook in `settings.json`, which would block every
session from editing code. Prompt-only scoping was rejected because it is not
enforceable. Check the guard with
`echo '{"tool_name":"Write","tool_input":{"file_path":"client/src/x.tsx"}}' | CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/spec-creator-guard.mjs; echo $?`,
which should print `2`.

- **Correction, 2026-10-02.** The 2026-10-01 draft of this entry claimed that "a
  subagent can't spawn subagents". That is false. Per
  code.claude.com/docs/en/sub-agents, a subagent **can** use `Agent`, up to
  three layers below the main conversation, and `Agent(type, …)` in `tools:` is
  an allowlist. What subagents really lose is `AskUserQuestion`: Claude Code
  removes it even when it is listed in `tools:`. So `spec-creator` fans out
  `researcher` itself, but still has to return its blocking questions for the
  caller to relay, unless it runs as the main thread with
  `claude --agent spec-creator`.

### 2026-10-01 — `planner` → `implementation-planner`: no spec authoring, two-phase Q&A protocol

**What:** `.claude/agents/planner.md` was renamed to
`.claude/agents/implementation-planner.md` (`name: implementation-planner`;
references in `implementor.md`, `architecture-reviewer.md`, agents
`README.md`, `plan-verifier/SKILL.md` updated). It treats `*/specs/**` as
read-only input and may never draft, edit, or plan a step that touches a
spec — except `e2e/specs/*.flow.json`, which are browser-flow tests, not
specs. It runs in two phases: Phase 1 returns a requirements review
(gaps/conflicts/ambiguities), recommendations, and a mandatory
multi-agent vs single-agent question, then stops; Phase 2 plans only after
the calling session relays the user's answers via `SendMessage`.
**Why:** a subagent cannot converse with the user, so "ask before planning"
only works if the agent stops and the caller relays — the description
frontmatter tells the caller to do so. Specs are user-owned intent in the
spec-driven flow; a planner that fills spec gaps silently redefines *what*
gets built.
**Rejected:** letting the caller pick the execution mode on the user's
behalf — the agent refuses a mode not attributed to the user. The
2026-08-13 planner entry below still holds for parallelization rules; they
now apply only in multi-agent mode.

### 2026-08-14 — Merging upstream/main: kept our own conventions/skills, dropped upstream's duplicates

**What:** `upstream/main`'s "integration/all-features" merge (PR #137) independently
built the same Conventions and Skills features this branch already had, at
different paths (`server/src/modules/{conventions,skills}/*`,
`client/src/lib/hooks/{conventions,skills}.ts`, `client/src/app/skills/**`,
`client/src/app/agents/[id]/.../SkillsTab/**`) plus a repo-scoped conventions
page at `client/src/app/repos/[repoId]/conventions/**` and a parallel
`client/src/app/skills/_components/{SkillEditor,SkillsRail}/**` tree. When
merging upstream/main into this branch, our own implementations were kept
everywhere they collided; upstream's duplicate files (including migrations
0011–0016, which back their skills/conventions schema) were dropped rather
than merged in. `.claude/skills/{onion-architecture,pr-self-review}` and the
new `.claude/skills/frontend-ui-architecture` were the one exception — taken
from upstream since they're shared tooling, not hands-on feature work, and
upstream's versions were substantially more developed.
**Why:** this branch's conventions/skills implementation is the author's own
hands-on lab work; silently overwriting it with an independently-built
duplicate on merge would erase the learning value, even though it means this
branch's local DB schema (migrations stop at 0012) is not compatible with
upstream's skills/conventions schema.
**Rejected:** taking upstream's versions of the duplicated features — would
have required re-wiring every dependent UI/test written against our own
module shapes, for no benefit over what already worked here.

### 2026-08-13 — test-writer/architecture-reviewer agents, plan-verifier/doc-writer skills: scoped exceptions to the read-only pattern

**What:** added `.claude/agents/test-writer.md` (read-write: Read, Write,
Edit, Bash, Grep, Glob, Skill) and `.claude/agents/architecture-reviewer.md`
(read-only over code, but with `Bash` scoped to read-only git inspection —
`git diff`/`log`/`show`/`status` only, no write/exec) plus
`.claude/skills/plan-verifier/SKILL.md` and `.claude/skills/doc-writer/SKILL.md`.
`architecture-reviewer` breaks from `planner`/`researcher`'s no-Bash-at-all
pattern specifically so it can discover a diff itself when the caller gives
no explicit file list — it is still forbidden from any non-read git command.
`doc-writer` never auto-writes conceptual documentation (README prose, "why"
rationale) — only derivative/reference docs (function signatures, Zod schema
shapes) get written directly; everything else is proposed as a draft for
review. `doc-writer` also confirmed (via `find -iname 'CHANGELOG*'` excluding
`node_modules`) that no `CHANGELOG.md` convention exists anywhere in this
repo, root or module, and must never invent one silently even if asked for
"a changelog entry."
**Why:** `architecture-reviewer`'s job is reviewing already-written code, so
unlike `planner` (plans before code exists) it plausibly needs to find out
what changed on its own; a narrow Bash allowlist was judged safer than
either full Bash or no Bash. The derivative/conceptual split for
`doc-writer` mirrors external best-practice research (see this entry's
session): auto-committing docs that follow mechanically from code carries
low misinterpretation risk, but business-logic/rationale prose does not.
**Rejected:** giving `architecture-reviewer` no Bash at all (full symmetry
with `planner`/`researcher`) — rejected because it would force every review
request to come with an explicit file list, which is unnecessary friction
that a narrow read-only allowlist avoids without reopening write risk.

### 2026-08-13 — planner/implementor agents: single Implementor, worktree isolation for near-each-other steps

**What:** `.claude/agents/planner.md` and `.claude/agents/implementor.md` use
one `implementor` agent definition for both backend and frontend work,
routed at runtime via a module-path table + the `Skill` tool, rather than
splitting into `implementor-backend`/`implementor-frontend` with
deterministic `skills:` frontmatter preload. Planner's "Parallelization
guidance" now tells the calling session to launch near-each-other steps
(same module, adjacent files, or a shared `@devdigest/shared` contract)
with `isolation: "worktree"` on the `Agent` tool call, and to cap
concurrent `implementor` fan-out at ~4 instances per batch.
**Why:** a single flexible Implementor handles mixed/e2e steps that don't
cleanly split backend/frontend; `skills:` preload would be a stronger
guarantee but forces a fixed domain per agent file. `isolation: worktree`
makes file conflicts physically impossible instead of relying only on each
instance's textual scope discipline; the ~4 fan-out cap follows
practitioner reports (Augment Code, davidloor.com) that orchestrator-style
result aggregation degrades past 4 concurrent workers.
**Rejected:** splitting into two specialized implementor agents with
frontmatter `skills:` preload — deferred, not ruled out; revisit if the
routing-table approach turns out to misroute in practice.

### 2026-07-31 — Standalone packages instead of a workspace

**What:** four packages, each with its own `package.json` and lockfile; sharing
happens through tsconfig path aliases, not published modules. Each suite is
gated by its own CI workflow with a path filter.
**Why:** _rationale not recorded anywhere in the repo — fill this in._ Do not
"fix" this into a workspace before that gap is closed; it is load-bearing for the
per-package CI path filters.

### 2026-07-31 — Zod contracts as the single source of truth

**What:** `@devdigest/shared` schemas drive request validation, response
serialization, and client-side types.
**Why:** one definition, no drift between server and client.
**Rejected:** hand-rolled `Schema.parse(req.body)` inside handlers — it validated
input but left responses unchecked, so contract drift surfaced in the browser.

## What Works

- **2026-10-02** — Agents verify through `scripts/verify.sh <pkg> <files>`,
  not `pnpm test`. In `server/`, `pnpm test` also runs the testcontainers
  `*.it.test.ts` lane, so N parallel `implementor`s each started a Postgres
  container and streamed the whole suite into context. The script runs
  typecheck, depcruise filtered to the passed files, and `vitest related`. It
  prints only `PASS`/`FAIL` lines plus the failing tail. `--full` runs once,
  from `/implement-plan`. `scripts/verify.sh server src/modules/x/service.ts`

## What Doesn't Work

- **2026-07-29** — Editing `client/src/vendor/shared/` alone silently desyncs the client from the API: it is a hand-copy of the canonical `server/src/vendor/shared/`, there is no sync script, and it already lags in 5 files. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared`.

  | File | Missing on the client side |
  |------|----------------------------|
  | `adapters.ts` | `sessionId` on the LLM call; `'openrouter'` in the provider union; `CommitFile` / `CommitFilesPayload` |
  | `contracts/eval-ci.ts` | the whole `AgentManifest` schema; the `Provider` / `CiFailOn` imports |
  | `contracts/knowledge.ts` | `'openrouter'` notes; expanded `CiFailOn` policy comments; the `agent_versions` config-snapshot block |
  | `contracts/productionize.ts` | `'openrouter'` in the provider enum |
  | `contracts/trace.ts` | comment wording only (harmless) |

  Every gap is OpenRouter- or CI-runner-related, so the client cannot currently express an OpenRouter-backed agent even though the API accepts one.

- **2026-08-21** — Map-reduce review (per-file chunks, `mapWithConcurrency` in
  `reviewer-core/src/review/run.ts`) has a structural cross-file blind spot: a
  chunk reviewing file A cannot see a compensating change in file B, so a
  signature/contract change and its implementation landing in different files
  of the SAME diff reads as "change without evidence of implementation" no
  matter how capable the model is. Seen live on PR #6 with
  `anthropic/claude-haiku-4.5`: General Reviewer flagged
  `server/src/modules/reviews/run-executor.ts`'s new `tx` argument on
  `insertReview`/`insertFindings` as unimplemented — `repository.ts`, a
  sibling file in the same diff, already had it, the reviewing chunk just
  never saw both halves in one pass. This is not a model-quality problem and
  will recur with any model; verify "no evidence of X" findings across the
  WHOLE diff (`grep` the other changed files) before trusting them, especially
  for type/signature-propagation changes that necessarily span files.
  **Resolved 2026-08-21: map-reduce chunking was removed** (see
  `reviewer-core/INSIGHTS.md`'s "Removed map-reduce chunking" decision) —
  every review is single-pass now, so there is no chunk boundary left to
  create this blind spot. Kept here as a reminder of WHY it was removed.

- **2026-08-21** — A "race condition" finding on `Promise.all()`-parallelized
  Node code needs verification against the single-threaded execution model,
  not multi-threaded-language pattern-matching. Seen on PR #6
  (`anthropic/claude-haiku-4.5`, General Reviewer): flagged concurrent agents
  in `run-executor.ts` racing on the shared `RunBus` (`server/src/platform/sse.ts`)
  as thread-unsafe. False — `RunBus.publish()` has no `await` inside it, so
  the whole read-seq/increment/push/emit sequence runs to completion
  atomically before the next scheduled microtask; two "concurrent" async
  tasks can never interleave mid-`publish()`. `Promise.all()` in JS means
  concurrent I/O, not concurrent execution — a real race needs an `await`
  splitting a read from its matching write on shared mutable state. Check for
  that specific pattern before accepting a JS/Node race-condition finding.

- **2026-07-29** — `.claude/skills/README.md` documents a `.cursor/skills → ../.claude/skills` symlink that does not exist, so Cursor gets no skills here. Evidence: `ls .cursor` → no such directory.

- **2026-08-05** — No package in this repo has ESLint — no config file, no `eslint` dependency, no `lint` script, no lint step in any of the five workflows — so the `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `client/src` suppress a rule that has never run, and nothing mechanically enforces import direction or hook deps. Evidence: `client/src/lib/hooks/reviews.ts:212`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:56`.
  - **2026-08-05** — Partly stale the same day: `server/` now has `eslint` + `typescript-eslint` and a `lint` script, but still no config file, so `pnpm lint` there fails rather than lints; the suppressed-rule finding above remains true of `client/`. Evidence: `server/package.json:11,45,50`; no `server/eslint.config.*`.
    - **2026-08-05** — Fully resolved for three of four packages: `server/`, `client/` and `reviewer-core/` each now have both a `lint` script and an `eslint.config.mjs`, and `cd server && pnpm lint` exits 0. The configs are **untracked on `refactor/architecture-plan-wave-0-3`**, so lint works locally and is still absent for anyone who has not pulled them; `e2e/` has neither. Evidence: `server/eslint.config.mjs`, `client/eslint.config.mjs`, `reviewer-core/eslint.config.mjs`.

- **2026-08-05** — The skills pipeline is complete on every layer except the one call that feeds it: `run-executor` builds its `reviewPullRequest` input without a `skills` key, so `parts.skills` is always undefined, the `## Skills / rules` section is never emitted and `PromptAssembly.skills` is always null — the trace drawer's skills block is dead UI, not a rendering bug. Evidence: `server/src/modules/reviews/run-executor.ts:189-205` (no `skills:`), `reviewer-core/src/prompt.ts:88-89,109`.

- **2026-08-05** — `client/messages/en/skills.json` promises a trust model the engine does not implement: four strings tell the user an imported skill is "wrapped as untrusted data" / "delimiter-wrapped", while `assemblePrompt` joins `parts.skills` verbatim into a trusted user section and only `wrapUntrusted()`s the diff/specs/repo-map — so shipping that copy as-is would state a security property the code does not provide. Evidence: `client/messages/en/skills.json:48,52,56,96` vs `reviewer-core/src/prompt.ts:89,109`.

## Codebase Patterns

- **2026-08-22** — `ReviewRunResponse`'s doc comment ("the persisted reviews
  are also returned once the (synchronous) run completes") is stale.
  `ReviewService.runReview` is fire-and-forget — `void
  this.executor.executeRuns(...).catch(...)` — and `POST /pulls/:id/review`
  always returns `reviews: []`; only `runs[].run_id` is immediately useful.
  A new consumer must poll `GET /pulls/:id/runs` until `status !== 'running'`
  and then read `GET /pulls/:id/reviews`, not trust the POST response to
  carry findings. `server/src/vendor/shared/contracts/review-api.ts:43`,
  `server/src/modules/reviews/service.ts:137`

- **2026-08-13** — A `@devdigest/shared` contract scaffolded ahead of its
  consumer (e.g. `PrIntentRecord = Intent.extend({ pr_id: z.string() })`,
  added for a not-yet-built "PR Brief" lesson) can silently stop matching
  what the eventually-built route returns — the classifier this contract was
  meant for ended up returning call metadata (`computed_at`/`provider`/
  `model`/`tokens_*`/`cost_usd`), not `pr_id`. Nothing catches this drift
  automatically since no response Zod schema is declared on most routes here
  (only `params`). When implementing a feature against a contract that
  predates it, diff the contract's fields against what the service/route
  actually constructs before assuming it's still accurate — don't just
  import and trust it. `server/src/vendor/shared/contracts/review-api.ts:59`

- **2026-08-01** — Per-run LLM cost is already computed end-to-end; the only
  thing ever missing is persistence. Every provider returns `costUsd` on its
  result, and for OpenRouter it is the REAL billed figure — the client asks for
  it with `usage: { include: true }` and reads `usage.cost`, falling back to the
  injected `PriceBook` estimator. `reviewPullRequest` then sums it across
  map-reduce chunks onto `ReviewOutcome.costUsd`. Commit `d45ab0d` removed the
  cost *feature* by dropping that one field at the destructure in
  `run-executor.ts` and deleting the `agent_runs.cost_usd` column, leaving the
  computation intact. So surfacing cost anywhere costs **zero extra model
  calls** — wire up the existing field, never add a pricing lookup or a second
  request. `reviewer-core/src/review/run.ts:216`

- **2026-08-05** — Pre-staged-for-a-lesson goes well beyond the empty tables `server/INSIGHTS.md` lists: for skills, the DB tables, the `@devdigest/shared` contracts, the `## Skills / rules` prompt section, the trace-drawer block + its colour token, and the entire `messages/en/skills.json` i18n namespace all ship in the starter with no module and no screen behind them — search for existing scaffolding before writing any of it. Evidence: `server/src/vendor/shared/contracts/knowledge.ts:114-141`, `reviewer-core/src/prompt.ts:109`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/constants.ts:16`, `client/messages/en/skills.json`.

  - **2026-08-05** — Conventions was staged even further than skills — table, `ConventionCandidate` contract, `FEATURE_MODELS.conventions`, `repoIntel.getConventionSamples()`, the whole `messages/en/conventions.json` namespace, `activeKeyFor("/conventions")` AND the mock adapter's schema names all shipped with no module, so the build was assembly, not authoring. Evidence: `server/src/modules/repo-intel/service.ts:630`, `client/src/components/app-shell/helpers.ts:31`, `docs/specs/conventions.md` §2.

  - **2026-10-03** — Project Context is staged but has no server route.
    Already there: `SpecFile`/`IndexStatus` contracts,
    `useContextFiles`/`useReindexContext` hooks that call the non-existent
    `/repos/:repoId/context`, `messages/en/context.json`,
    `activeKeyFor("/context")` (no `NAV` item), and `PromptParts.specs`. The
    `## Project context` section is already wrapped with `wrapUntrusted`, and
    the trace-drawer specs block and `RunTrace.specs_read` exist too. The gap is
    `run-executor`, which hardcodes `specs_read: []` and never passes `specs`.
    Don't add editing to the context page: the clone resync runs
    `git reset --hard origin/<branch>`, which silently wipes any file written
    there. Evidence: `server/src/modules/reviews/run-executor.ts:332,553`,
    `reviewer-core/src/prompt.ts:96-99`,
    `server/src/adapters/git/simple-git.ts:83-91`,
    `specs/2026-10-03-project-context.md`. **Wired 2026-10-03:** the route
    (`server/src/modules/context/`) and run-time injection now exist. The pure
    rules that both `context` and `reviews` need live in
    `server/src/platform/project-context.ts`, because `no-cross-module-internals`
    blocks one module from importing another module's `helpers.ts`.

- **2026-08-05** — `POST /agents/:id/skills` is two endpoints in one body schema and picking the wrong shape silently destroys data: `{skills:[…]}` / `{skill_ids:[…]}` REPLACE the agent's whole ordered set (that is what `useSetAgentSkills` sends), while `{skill_id}` appends — so "also give this agent the new skill" must use the single-id form or the agent's other skills vanish. Evidence: `server/src/modules/agents/routes.ts:170-180`, `client/src/lib/hooks/skills.ts` (`useLinkAgentSkill` vs `useSetAgentSkills`).

- **2026-07-29** — `.gitignore` carries un-ignore rules for an `agent-runner/dist/` that does not exist yet; they are pre-staged for the Export-to-CI lesson (L06), not leftovers to clean up. Evidence: `.gitignore:3-6`, `reviewer-core/README.md:7-9`.

## Tool & Library Notes

- **2026-10-03** — Claude Code sub-agent journals
  (`~/.claude/projects/<slug>/<session>/subagents/agent-*.jsonl`) write one
  `assistant` line per content block, each repeating the same `usage` under one
  `requestId`. Summing `usage` over every line overcounts tokens by the block
  count — dedupe per `requestId` (last line wins). Parent of a nested agent =
  the journal holding the `tool_use` whose id equals the child's
  `.meta.json` `toolUseId`. Sessions started from a subdirectory (e.g.
  `mcp-server/`) get their own `<slug>`.
  `.claude/skills/workflow-retro/scripts/analyze_journals.py`

- **2026-10-02** — There is no `arch` script in `server/package.json`, committed
  or local, yet `pnpm arch` is cited by `.github/workflows/server-unit.yml:72`,
  `server/.dependency-cruiser.cjs` and `pr-self-review`. Run depcruise
  directly. `main` already carries 4 `no-cross-module-internals`/cycle errors,
  so a scoped gate must keep only the violations whose source is a changed
  file. That filter is `scripts/verify.sh`'s `arch_scoped`.
  `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err`

- **2026-07-29** — Half this repo is pnpm and half is npm, so running `pnpm install` in `reviewer-core/` or `e2e/` would create a second competing lockfile — match the lockfile already in the directory, not the root README's pnpm prerequisite.

  | Package | Lockfile |
  |---------|----------|
  | `server/`, `client/` | `pnpm-lock.yaml` |
  | `reviewer-core/`, `e2e/` | `package-lock.json` |

- **2026-07-29** — `skills-lock.json` disagrees with `.claude/skills/` in both directions, so it cannot be read as an index of available skills; read the directory. Evidence: lock-only — `architecture-patterns`, `github-workflow-automation`; disk-only — `mermaid-diagram`, `react-best-practices`, `react-testing-library`, `security`.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Wrote per-module `CLAUDE.md` files and swept the repo for drift while doing it; every entry here and in the per-module files came from that sweep. The `engineering-insights` skill was built in the same session.
- **2026-07-29** — Run Cost Badge lab re-added per-run cost (`agent_runs.cost_usd`, migration 0010) that commit `d45ab0d` had deliberately removed — the removal only disconnected persistence/UI, `reviewer-core` kept computing `ReviewOutcome.costUsd` the whole time, so the re-add was a one-field reconnect. Evidence: `reviewer-core/src/review/run.ts:216`.
- **2026-08-04** — `.claude/skills/react-frontend-architecture/` deliberately holds only `SOURCES.md` (curated research for a skill not yet written) — the missing `SKILL.md` is pending work, not a broken skill to clean up. Evidence: `.claude/skills/react-frontend-architecture/SOURCES.md:1-15`.
  - **2026-08-04** — `.claude/skills/onion-architecture/` now follows the same pattern: `SOURCES.md` holds the verified research plus the SKILL.md plan (§12) for the backend layering skill. Evidence: `.claude/skills/onion-architecture/SOURCES.md:1-10`.
    - **2026-08-05** — Resolved: the skill is written (`SKILL.md` v1.0.0 + `README.md` sources) and listed in the catalog; unlike the frontend skill, `SOURCES.md` was **kept** — it carries the per-tool layer map (§13) and the live-code drift the rules were written against (§14). Evidence: `.claude/skills/onion-architecture/SKILL.md:1-6`, `.claude/skills/README.md:9`.
  - **2026-08-04** — Resolved same day: renamed to `.claude/skills/frontend-ui-architecture/` and the skill was written (`SKILL.md` v1.0.0 + `README.md` sources); `SOURCES.md` was absorbed into those two files and deleted. Evidence: `.claude/skills/frontend-ui-architecture/SKILL.md:1-6`.
- **2026-08-05** — Second research pass on `.claude/skills/onion-architecture/SOURCES.md`: mapped every backend dependency to an onion layer and added the five areas the first pass missed (LLM SDKs as an ACL, jobs/queues, the SSE run bus, config/secrets, mechanical enforcement); the SKILL.md plan is now §15, and §12 carries a superseded banner.
- **2026-08-05** — Repo-wide architecture read against `frontend-ui-architecture`, the `onion-architecture` SOURCES research, and the React/Next/Fastify/Postgres skills; analysis only, no code changed. Findings landed as entries in this file and in `client` / `server` / `reviewer-core`.
- **2026-08-05** — Acted on that audit: mechanical enforcement (ESLint in all three packages, `dependency-cruiser` layer rules + `pnpm arch`, CI lint steps), the `pulls`/`settings` module promotions with `polling`/`workspace` moved onto shared container repositories, DB indexes + enum CHECK constraints (migrations 0011/0012), and the client's missing error boundaries. Still open from the same audit: no route declares `schema.response`, nothing runs in a transaction, and `client/src/vendor/shared/` still lags the canonical copy.

- **2026-08-05** — Spec for the Skills feature (storage, editor, agent binding, `.md`/`.zip` import, seeded Test Quality + API Contract reviewers) written to `docs/specs/skills.md`; investigation only, no code changed. The four entries above came from that read.
  - **2026-08-05** — Then implemented in full the same session: `modules/skills/`, `agent_skills.enabled` (migration 0013), the `/skills` page + agent Skills tab, `fflate`-based `.zip` import, and the `run-executor` wiring that finally makes the prompt block non-empty. The two entries under *What Doesn't Work* above are resolved by it; the trust-copy one was fixed by rewriting `client/messages/en/skills.json`.

- **2026-08-05** — Built the Conventions Extractor (spec + roadmap in `docs/specs/conventions.md`): `modules/conventions/`, migration 0015, the `/repos/[repoId]/conventions` page and the skill-draft modal. The design premise — a model proposes, code samples and code verifies — is the same grounding-gate shape `reviewer-core` already uses for findings.

## Open Questions

- **2026-08-05** — Is `repoIntel.getConventionSamples()` filtering tests out right for this feature? It reuses the review-context rank filter (`isJunkPath` drops `.test.`/`.spec.`), so testing conventions — some of the most useful house rules — are structurally invisible to the extractor. Evidence: `server/src/modules/repo-intel/service.ts:629-630,709-728`.

- **2026-07-29** — Is the client's vendored `@devdigest/shared` copy meant to be synced by a manual step someone knows about, or was it simply forgotten? Nothing in `scripts/` or CI touches it, and the drift is one-directional.
- **2026-07-29** — Are `architecture-patterns` and `github-workflow-automation` in `skills-lock.json` planned additions or removed skills whose lock entries were never cleaned?
