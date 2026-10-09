# Export to CI — Implementation Plan

## Source requirements

[`specs/14-export-to-ci.md`](../specs/14-export-to-ci.md) (SPEC-14, status
**draft**, treated as complete and ready to plan against). This plan covers
**every** acceptance criterion in that spec. Each phase below owns a disjoint
slice, so `plan-verifier` can trace phase → AC without re-reading the spec.

| Phase | AC-IDs owned |
|---|---|
| **A** — Foundation (contracts, schema, adapter, container) | 49, 50, 52 (precondition half), 53 (migration half); the storage substrate for 19, 24, 59 |
| **B** — Generation (pure, security-critical) | 9, 11, 11a, 11b, 12, 13, 14, 15, 16, 52 (runtime half), 58, 58a, 60, 61, 62 |
| **C** — Export / install | 5, 6 (payload), 7, 8, 10, 10a, 37, 59, 64, plus the server halves of 4c and 25 |
| **D** — Ingest + read surfaces | 17, 18, 19, 20, 21, 22, 23, 24, 30 (trace row), 41–47 (aggregation), 55, 63, plus the read halves of 25, 27, 29, 32 |
| **E** — Client | 1, 2, 2a (UI), 3, 4, 4a, 4b, 4c (UI), 5/6/10/10a (UI), 26–40, 42–44, 46, 47, 48, 51, 54, 56, 57 |
| All phases | 53 (typecheck + tests in every touched package) |

Decisions **D1–D18** and non-goals **N1–N16** are settled; nothing below
reopens them. Load-bearing throughout:

- `ci_installations` / `ci_runs`, the `Ci*` contracts, `AgentPerf*`,
  `agent_runs.source='ci'`, `GitHubClient.commitFiles`/`.openPullRequest`/
  `.findOpenPr`, `messages/en/ci.json`, `messages/en/agentPerformance.json`
  and `ExportWizardSteps` are **adopted and reshaped in place** (D1). Verified
  zero consumers: `grep -rn "ciInstallations\|ciRuns\|AgentPerf" server/src
  client/src` returns only the schema file, the schema barrel
  (`server/src/db/schema.ts:45,87-88`), the two `vendor/shared` copies, and
  `client/src/components/app-shell/helpers.ts:48`.
- Generation is deterministic string assembly; ingestion is a read. **Zero LLM
  calls anywhere in this feature** (AC-9, AC-25).
- `reviewer-core` is untouched (N6/D9): `git diff reviewer-core/` must be empty.
- `agent-runner` is **pulled in, never authored** (N5/AC-52).
- `contracts/observability.ts` is **not touched** (N7/AC-50) — it belongs to
  `specs/13-multi-agent-review.md`.
- The sharpest requirement in the whole spec is **AC-16 / D11**: no
  user- or agent-authored text ever reaches a `run:` step of the generated
  workflow. The failure mode is arbitrary command execution in a third party's
  pipeline with their credentials, not bad data in our DB.

## Clarifications & recommendations

### The spec's nine `[NEEDS CLARIFICATION]` items — all pre-resolved

The product owner ruled these are planner calls (1, 2, 3, 5, 6, 8) or deferred
debt (4, 7 partially, 9). Decisions, applied not re-asked:

1. **CI Runs scope** — workspace-wide at `/ci-runs`, per the spec's own stated
   assumption. Confirmed by the reserved `nav.ci-runs` label
   (`client/messages/en/shell.json:27-28`) and the already-present
   `pathname.startsWith("/ci-runs")` branch (`helpers.ts:49`).
2. **Which duration** — the runner's own review duration
   (`CiResultArtifact.duration_ms`), falling back to the provider job's
   wall-clock when no artifact exists, and a placeholder when neither does.
   `ci_runs` stores **both the value and which source it came from**
   (`duration_source`), so the column header can be honest rather than
   ambiguous.
3. **CI runs on the PR detail page** — not in this slice. The spec notes adding
   it later needs no contract change. Do not touch the PR detail page.
4. **Retention** — no pruning. Known debt, unchanged. Do not build it.
5. **"Update CI config" on unchanged config** — always offered, no change
   detection. Narrow-scope posture (spec §Scope posture).
6. **Early repo-existence validation** — no per-keystroke provider call. The
   Target step validates the `owner/name` shape locally; the Configure step's
   secret-name lookup (AC-64) is the **first** provider call and doubles as the
   existence/permission probe, so a bad repository surfaces one step before
   Install rather than at Install. Matches AC-10a, which explicitly permits
   failing at Install.
7. **Ship the inert memory file** — yes (D15/AC-58/AC-58a), unchanged.
8. **Which secret names to check** — exactly one: `OPENROUTER_API_KEY`.
   `GITHUB_TOKEN` is reported as CI-provided with **no lookup at all** (AC-6,
   AC-64). See R-7 for the third state this needs.
9. **Memory re-export staleness** — known debt, unchanged. Do not build it.

### Planner decisions the spec explicitly delegated

- **P-1 — Generation lives in `server/src/modules/ci/`, not a top-level `ci/`
  package.** The spec's opening note leaves this open and requires only that
  the runner's docstrings end up pointing at the real path. They already point
  here: `agent-runner/src/index.ts:5` names
  `server/src/modules/ci/constants.ts` / `workflow.ts`,
  `src/context.ts:9` names `server/src/modules/ci/workflow.ts`,
  `src/manifest.ts:10` names `server/src/modules/ci/manifest.ts`, and
  `agent-runner/CLAUDE.md` §"Read When" says outright *"Changing what gets
  embedded in the exported PR / workflow generation → `server/src/modules/ci/`
  (owned by the server `ci` module, not this package)"*. Picking the server
  module therefore requires **zero runner edits**, which is the only choice
  compatible with N5. A top-level `ci/` package would force a docstring edit in
  a package this slice must not modify.

- **P-2 — The "runner bundle" is a directory of three files, not one.** Read
  off the built output (`agent-runner/dist/`): `index.js` (1.6 MB, the ncc
  bundle), `310.index.js` (a lazily-`import()`ed webpack chunk — `index.js`
  references it, `grep -c 310 index.js` = 5), and `package.json` containing
  exactly `{"type":"module"}`. **All three must ship under
  `.devdigest/runner/`.** Dropping `package.json` breaks ESM resolution in a
  target repository whose own `package.json` says `commonjs` or is absent;
  dropping `310.index.js` breaks the moment that chunk loads. AC-14's stated
  check ("the path the workflow executes exists in the bundle") is therefore
  **not sufficient** — the test must assert every file in `agent-runner/dist/`
  is present in the bundle at the same relative path. D15's "five files" is a
  conceptual count; the real count is `4 + N` (7 today, one manifest + one
  skill). `ci.json:installCardBody` already interpolates `{count}`, so no copy
  change is needed — but nothing may hard-code 5.

- **P-3 — AC-18's commit check needs an envelope the *workflow* writes,
  because the runner emits no commit.** `CiResultArtifact`
  (`server/src/vendor/shared/contracts/eval-ci.ts:329-344`) has no
  commit/sha field, and `agent-runner/src/artifact.ts:buildResultArtifact`
  constructs exactly those fields and nothing else — so "the commit the run
  reviewed" is simply not in the artifact, and N5 forbids adding it there.
  **Decision:** the generated workflow writes a sidecar `devdigest-run.json`
  from GitHub-provided context (passed through `env:`, never inlined into a
  script body — D11/AC-16) carrying
  `{ schema_version, commit, repository, pr_number, run_id, runner_exit }`, and
  uploads it inside the same artifact. Ingestion compares `envelope.commit`
  against the provider run's `head_sha` and `envelope.repository` against the
  installation's repository. This is a new `CiRunEnvelope` contract in
  `eval-ci.ts` (both copies), owned by this feature. A missing or unparseable
  envelope fails the commit check → failed run with a stated reason (AC-18).
  There are zero existing installations, so there is no back-compat cost.
  *What it actually defends:* an artifact uploaded by, or replayed from, a
  different run/PR/commit — not "the runner lied about itself".

- **P-4 (RECOMMENDATION — overturnable)** — **the runner bundle's three files
  are previewed by path + byte size + sha256, with contents fetched on demand;
  every other file is previewed with full contents inline.** A literal reading
  of AC-3 ("each with its path and its full contents") would push 1.6 MB of
  minified single-line JS into the browser on **every** Configure change,
  because AC-4c regenerates the preview on every toggle. The bundle is also the
  one part of the file set that is never editable and never varies with
  configuration. The Preview step still lists all seven paths with their
  editability mark, and the bundle's bytes stay one click away
  (`GET /agents/:id/ci/preview/file`). Overturn this if you want the bytes
  inline; everything else in the plan is unaffected.

- **P-5 — Both CI tables gain a `workspace_id` column.** The spec's
  §Non-functional describes today's shape ("`ci_installations` carries no
  workspace column; it reaches a workspace only transitively through its
  agent, and `ci_runs` reaches one only through its installation"). That shape
  cannot satisfy AC-24 in the orphan case the spec itself calls out:
  `ci_runs.ci_installation_id` is `ON DELETE SET NULL` (`schema/ci.ts:16-18`),
  so a run whose agent was deleted has **no path to a workspace at all**.
  Both tables are empty (D1), so adding a `NOT NULL` FK is free. This is the
  same move plan 12 made for `eval_runs` ("AC-54 becomes a column, not a
  join") and it turns every read into a single-column scope check.

- **P-6 — AC-59 is a database unique index, not a service-layer check alone.**
  `UNIQUE (workspace_id, repo)` on `ci_installations` is exactly D18/AC-59
  ("one installation per repository, because the runner throws on more than one
  manifest" — `agent-runner/src/manifest.ts:37-44`). The service still returns
  a stated reason; the index is what makes it true under a double-click.
  Likewise `UNIQUE (workspace_id, provider_run_id)` on `ci_runs` is AC-19 under
  the spec's "two browser tabs both auto-refreshing" edge — ingest with
  `ON CONFLICT DO UPDATE`, not read-then-write.

- **P-7 — AC-64 needs three states, not two.** `GET /repos/{o}/{r}/actions/
  secrets` requires a fine-grained PAT with *Secrets: read*, which the
  local-mode credential usually lacks. A 403 must render as **unknown**, never
  as "missing" (which would tell the user to add a secret they may already
  have) and never as an error that blocks the wizard. `CiSecretStatus.state` is
  `'configured' | 'missing' | 'unknown'`.

- **P-8 — Zip in both directions with `fflate`, already a server dependency**
  (`server/package.json:36`, used today by `modules/skills/helpers.ts:1`).
  `unzipSync` reads the artifact ZIP, `zipSync` produces AC-10's downloadable
  archive. **No new dependency.** The artifact ZIP is untrusted input from a
  third party's CI, so the read follows the guard posture already proven in
  `server/src/modules/skills/helpers.ts:210-260` — entry-count limit, per-entry
  size cap, `..`/absolute-path refusal, and a `filter` callback so non-target
  entries are never inflated. Copy that **posture** into a local
  `modules/ci/artifact.ts`; do **not** import it (`no-cross-module`,
  `.dependency-cruiser.cjs:63-73`) and do not refactor the skills module.

- **P-9 — Add `yaml` (^2.6.1) to `server/package.json`; do not hand-roll YAML
  emission.** Both generated YAML documents must survive an agent name,
  system prompt or skill slug containing quotes, newlines, `${{`, or a leading
  `-`. AC-16's whole point is that this escaping is correct. `yaml`'s
  `stringify` is the same version `agent-runner` already depends on
  (`agent-runner/package.json`), so the manifest is emitted by the same library
  that parses it (`agent-runner/src/manifest.ts:3`) — round-tripping is then a
  property of one library, not of two hand-written implementations agreeing.
  This is the only new dependency in the plan.

- **P-10 — `GET /agents/performance` is implemented in `modules/ci/`.** Its
  defining requirement is unifying `source='local'` and `source='ci'`
  aggregates (AC-45/AC-46), which is this feature's, and putting it in
  `modules/agents/` would mean editing a module this feature does not own —
  which `no-cross-module` would then block for the CI half anyway. The route
  path stays `/agents/performance` because `contracts/productionize.ts:135`
  already names it. Add a comment at the seam naming the alternative (a
  separate `modules/agent-perf/`), so a reviewer reads it as a decision rather
  than an accident.

- **P-11 — Nav wiring: `g i` → CI Runs (icon `Zap`), `g f` → Agent Performance
  (icon `Gauge`).** Taken `gKey`s today are `p x t s a c e ,`
  (`client/src/vendor/ui/nav.ts:20-98`); the sibling worktree's SPEC-13 takes
  `m`. Both `i` and `f` are free after either merge order. **Both icons are
  already in `vendor/ui/icons.tsx`'s registry** (`Zap` at :29/:112, `Gauge` at
  :58/:141) — unlike plan 12, which had to add `BarChart3`. Verify before
  assuming; do not add an icon that is already there.

- **P-12 (RECOMMENDATION)** — **tighten `GET /runs/:id/trace` to be
  workspace-scoped.** `modules/reviews/routes.ts:167-173` calls
  `service.getRunTrace(req.params.id)` and `service.ts:214-216` takes **no
  `workspaceId`** — a pre-existing cross-workspace read. AC-30 makes CI runs
  readable through that exact route, and AC-24 says "over any surface", so this
  feature is what puts weight on the gap. The fix is threading `workspaceId`
  through the service method and the repository query. It touches
  `modules/reviews`, which this feature otherwise does not own — flagging it
  rather than doing it silently. If you decline, record it as accepted debt;
  `pr-self-review` will otherwise read it as this feature's regression.

- **P-13 (RECOMMENDATION)** — **reconcile `vendor/shared/adapters.ts` fully
  while porting.** AC-49 mandates the client copy gain `AgentManifest` and the
  `openrouter` provider id. This plan also adds three `GitHubClient` methods,
  and the client copy already lacks `CommitFile`/`CommitFilesPayload` and the
  three `commitFiles`/`openPullRequest`/`findOpenPr` signatures (root
  `CLAUDE.md` §Do-not-touch; confirmed by `diff -rq`). Porting the whole block
  costs one paste and leaves the two `adapters.ts` copies identical instead of
  differently-drifted. The client never implements `GitHubClient`, so the risk
  is nil. Overturn if you'd rather keep this diff minimal — in which case add
  only the new methods to the server copy and record the unchanged drift
  explicitly.

### Planner findings — read before coding

1. **`activeKeyFor` is already correct for both new routes and needs no edit.**
   `client/src/components/app-shell/helpers.ts:48-49` has
   `startsWith("/agent-performance")` and `startsWith("/ci-runs")`. Neither is
   shadowed: `"/agent-performance".startsWith("/agents")` is `false`, and
   `/ci-runs` contains no earlier branch's substring. This is a live instance
   of the substring-match bug class in `client/LEARNINGS.md:486-503` — verify,
   don't re-add. The **missing** wiring is `nav.ts`'s `NAV` array and
   `SHORTCUTS`, exactly as `client/LEARNINGS.md:362-403` predicts for the third
   time running.
2. **`editor.tabs.ci` already exists** (`client/messages/en/agents.json:52`),
   next to the unused `stats`. AC-33 needs one entry appended to `TABS`
   (`AgentEditor/constants.ts:12-17`) and one branch in `AgentEditor.tsx` —
   nothing else.
3. **`formatCost` already implements AC-27's exact requirement.**
   `client/LEARNINGS.md:15-29`: `src/lib/format.ts`'s `formatCost` keeps
   `null → "—"` strictly distinct from `0 → "$0.00"`, using `toPrecision(3)`
   for sub-dollar values. AC-27's "placeholder, not a zero" is a *reuse*, not
   new formatting logic. Do not write a second money formatter.
4. **AC-28's filter chips must count the filtered list, not the raw rows** —
   `client/LEARNINGS.md:179-196`. Five filters compose here (date, agent,
   repo, status, source); apply-then-count, and reset any focus index when a
   filter changes.
5. **AC-7 needs `api.postWithStatus`, not a flag in the response body.**
   `client/LEARNINGS.md:578-593`: `api.post` discards the HTTP status, and
   plan 12 already added `postWithStatus` for precisely this shape. Export
   returns `201` on a first install and `200` on a reuse-and-republish, with an
   identical `CiExport` body — that status is the only honest signal for
   AC-7's "one installation, one PR, a new commit" toast copy.
6. **`RunTrace.config.source` already admits `'ci'`**
   (`server/src/vendor/shared/contracts/trace.ts:126`) and
   `PromptAssembly` requires only `system` and `user` as non-nullish strings
   (`trace.ts:39-61`). So AC-30 needs **no contract change**: ingestion writes
   a `run_traces` row (`schema/runs.ts:76-81`) with `config.source='ci'`, real
   `stats`, empty-string `system`/`user`, and empty `tool_calls`/`raw_output`/
   `log` arrays. The client branches on emptiness to render "not available for
   CI runs". Do not add a nullable variant of `PromptAssembly`.
7. **A run whose gate triggered exits non-zero and is a *success*.** The
   provider run's `conclusion` is therefore **not** the status source. Derive
   status from the artifact: artifact present + `findings_count > 0` →
   `succeeded`; artifact present + `0` → `no_findings`; artifact absent →
   `failed` with a reason (AC-21); provider run still in progress → `running`,
   never `failed` (spec §Edge cases).
8. **The runner strips `.devdigest/` and `.github/workflows/` from the diff it
   reviews** (`agent-runner/src/diff.ts:21`, `IGNORED_DIFF_PREFIXES`), so the
   export PR itself is reviewable without the 1.6 MB megafile blowing up an
   inline comment. Nothing to build — but do not "helpfully" add a
   `.gitattributes` or a path filter to the generated workflow that would
   duplicate it.
9. **Zero rows must be confirmed before the migration.** `server/LEARNINGS.md:38-54`
   is the rule; run `select count(*) from ci_installations;` and `from ci_runs;`
   and expect `0` before generating a migration that adds `NOT NULL` columns
   without defaults.
10. **This pass adds columns and tightens types; it drops nothing** — so it
    should be **one** `db:generate`. Run it as `pnpm db:generate < /dev/null`
    anyway (`server/LEARNINGS.md:64-82`): if it hangs, drizzle-kit found a
    rename ambiguity and the pass must be split.
11. **A prior plan for this spec exists on a sibling branch.**
    `.worktrees/devdigest-ci/plans/14-export-to-ci.md` (839 lines, commit
    `85c6f05`, branch `feat/export-to-ci`) plans the same spec, with
    implementation in progress in that working tree. This plan was written
    independently against the code and **does not supersede it by default**.
    Its phase seams (foundation → generator → export → ingest → client) landed
    in the same places, which is corroborating rather than surprising. Its
    differing calls, for the record: it did not identify P-2 (the three-file
    bundle) or P-3 (the missing commit field). Decide deliberately which branch
    executes; do not run both.
12. **`agent-runner` is absent from this worktree.** It exists on
    `upstream/lesson-7-lab/agent-runner` and in `.worktrees/devdigest-ci`.
    AC-52's precondition is Phase A's first task — see Approach §A0.
13. **Routing-table gap:** `.claude/skills/pr-self-review/SKILL.md`'s Phase 3
    table has no row for `agent-runner/**` (the same class of gap plans 09/10
    flagged for `mcp-server/**`). It does not bite here — this plan adds that
    package verbatim and edits nothing inside it (N5) — but it is worth adding.

## Execution mode

**Multi-agent. Settled by the user; not re-asked.** Five phases, each run as
its own `/implement-plan` pass (`implementer` → `plan-verifier` gate →
`architecture-reviewer` fix loop). A phase's Verification block must be green
before the next phase starts.

1. **Phase A — Foundation** (Approach §A0–§A5)
2. **Phase B — Generation** (§B1–§B5) — pure, security-critical, no I/O
3. **Phase C — Export / install** (§C1–§C3)
4. **Phase D — Ingest + reads** (§D1–§D4) — security-critical boundary
5. **Phase E — Client** (§E1–§E5)
6. **`test-writer`** once, after E, for any Verification-matrix row the
   implementation passes did not produce
7. **`/pr-self-review`** immediately before push (it re-runs the full suites)

**Why these seams and not fewer:** B is pure functions with no DB and no
network and carries the highest-severity requirement in the spec (AC-16) — it
deserves its own review pass with `security` loaded and nothing else in the
diff. D is the untrusted-input boundary and deserves the same. A must land
first because every later phase imports its contracts. **Phase E is the
largest** (30+ ACs); if its context budget runs short, split it at the stated
seam between §E3 and §E4 (wizard + CI tab, then CI Runs + Agent Performance)
and run two `implementer` passes over the one plan section.

## Modules affected

| Module | Why |
|---|---|
| **server** | The substance: a new `modules/ci/` (13 files), the `ci_installations` / `ci_runs` reshape + one migration, three new `GitHubClient` methods across `vendor/shared/adapters.ts` + `adapters/github/octokit.ts` + `adapters/mocks.ts`, two `container` getters, one `modules/index.ts` entry, one `AppConfig` entry, one new dependency (`yaml`), and `verify:l07`. |
| **client** | The `/ci-runs` and `/agent-performance` route trees, the export wizard, the `CiTab` inside `AgentEditor`, `src/lib/hooks/ci.ts`, the `nav.ts` `NAV` + `SHORTCUTS` entries, the `RunTraceDrawer` CI branches, and the `ci.json` / `agentPerformance.json` / `shell.json` fill-in. |
| **both `vendor/shared`** | `contracts/eval-ci.ts` (the Export-to-CI block), `contracts/knowledge.ts` (`Provider`'s `openrouter` id → client), `contracts/productionize.ts` (`AgentPerf*`), and `adapters.ts` — hand-edited in **both** unsynced copies (root `CLAUDE.md` §Do-not-touch, AC-49). |
| **agent-runner** | **Added, not authored** (N5/AC-52). One `git checkout` + install + build. `git diff` against the upstream tree must be empty afterwards. |
| **reviewer-core** | **Not affected** — N6/D9. `git diff reviewer-core/` must be empty. |
| **mcp-server** | **Not affected** — N8. |
| **e2e** | **Not affected** — N9. No new browser flow; ingestion is proved by server integration tests against a stubbed GitHub client (AC-53). |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` §Do-not-touch — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent, already-drifted copies**. Every
  contract this feature touches lands in both, by hand (AC-49).
  `pr-self-review` Phase 4 rates a one-sided change HIGH.
- `CLAUDE.md` §Conventions — migrations are **not** applied on boot:
  `cd server && pnpm db:migrate` after generating (AC-53 restates this).
- `CLAUDE.md` §Conventions — secrets live in `~/.devdigest/secrets.json`, never
  in git or the DB. AC-15/AC-55 are this rule pointed outward.
- `CLAUDE.md` §Gotchas — e2e flows `02`/`04`/`05` assume a DB seeded with only
  the one demo repo. This plan seeds nothing, so it must stay that way.

### server

- `server/CLAUDE.md:12-14` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse`. Every
  new body here needs a zod schema; AC-18's field-level rejection of a
  malformed artifact is a **separate** `safeParse` at the ingest boundary, not
  a route schema.
- `server/CLAUDE.md:15-16` — a new module must be added to
  `src/modules/index.ts` (one import + one entry) or it is dead code.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks. The three new
  `GitHubClient` methods must land in `mocks.ts` in the same commit.
- `server/CLAUDE.md:19-21` — `SecretsProvider` is the one channel;
  `GITHUB_TOKEN` is canonical. `container.github()` already throws
  `ConfigError` when it is missing (`platform/container.ts:342-348`) — see
  `server/LEARNINGS.md:150-166`.
- `server/CLAUDE.md:31-32` — never hand-edit an applied migration.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; do not add per-feature keyword scanning. AC-63's
  credential-shape scan is **not** an exception: it matches credential
  patterns in an untrusted artifact, never instruction-shaped prose.
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping without Docker); everything else hermetic.
- `server/.dependency-cruiser.cjs:63-73` `no-cross-module` (error) forbids
  `modules/ci/**` importing `modules/agents/**`, `modules/skills/**`,
  `modules/reviews/**` or `modules/repos/**` — **including `import type`**
  (`tsPreCompilationDeps: true`, `:88-90`). `_shared` is the only exempt
  folder. `:41-49` `no-container-in-services` forbids `service.ts` importing
  `platform/container.ts`. `:51-62` `db-only-in-repositories` confines
  `src/db/**` to `repository.ts` and `routes.ts`. Importing `adapters/**` and
  `vendor/shared` from a module is fine.
- `server/LEARNINGS.md:38-54` — grep for the table/contract name and confirm
  "never written to" before redesigning in place. Done; re-confirm with
  `select count(*)` before adding `NOT NULL` columns (finding 9).
- `server/LEARNINGS.md:64-82` — the `drizzle-kit generate` non-TTY hang and the
  split-the-pass rule (finding 10).
- `server/LEARNINGS.md:150-166` — `ConfigError` responds **HTTP 500**, which is
  wrong for AC-10a's "no credential configured" branch. Resolve the GitHub
  client **before** any installation row is written and translate `ConfigError`
  into a `422` naming what is missing, so AC-10a gets a stated reason and zero
  orphan rows.
- `server/LEARNINGS.md:198-204` — the `vendor/shared` copies have already
  drifted; there is no sync script.
- `server/LEARNINGS.md:206-290` — a new module needing another module's
  repo/service declares a **narrow local port** satisfied structurally,
  composed at `routes.ts`; and for a handful of fields, a fully local
  interface beats importing a row type (the `AgentRecord` precedent at
  `modules/reviews/adhoc.ts:24-58`). Expect **zero** new `pnpm arch` baseline
  entries from `modules/ci/`.
- `server/LEARNINGS.md:483-497` — `.nullable()` on a shared contract makes the
  key **required**. Deliberate for every "was not produced" field on `CiRun`
  (AC-27 must state absence, never omit it); wrong for genuinely optional
  input fields — decide per field.
- `server/LEARNINGS.md:656-705` — the reserved-but-unwired pattern, and the
  "same name, two integration points" trap. Relevant here: `CiRun.source` and
  `agent_runs.source` are different columns with the same name and different
  meanings — `agent_runs.source` is `'local' | 'ci'` (D7), `ci_runs.source` is
  the CI provider. Do not collapse them.
- `server/LEARNINGS.md:706-721` — the dependency-cruiser baseline matches exact
  from→to edges. If `pnpm arch` fires, fix the import; do **not** re-baseline.
- `server/LEARNINGS.md:722-757` — tests build partial `as unknown as Container`
  mocks; a new `container.<x>` read in shared code must tolerate a mock lacking
  it.
- `server/src/modules/skills/helpers.ts:210-260` — the untrusted-archive
  posture P-8 copies (entry limit, size cap, traversal refusal, `filter` so
  nothing unwanted is ever inflated).
- `server/src/modules/brief/routes.ts:1-42` — the routes-as-adapters shape:
  `getContext` first, one service call, zod schemas, no `src/db` import.
- `server/src/platform/container.ts:210-229` — the lazy `briefRepo` /
  `briefService` getter shape to copy; `:342-348` — `github()` is **async** and
  throws `ConfigError`.
- `server/src/adapters/github/octokit.ts:235-300` — `openPullRequest` /
  `commitFiles` / `findOpenPr`, already implemented with
  `withRetry`/`withTimeout`; the three new methods must use the same wrappers.

### agent-runner

- `agent-runner/CLAUDE.md` §"Read When" — generation is owned by
  `server/src/modules/ci/`, not this package (P-1).
- `agent-runner/CLAUDE.md` §"Why This Package Intentionally Breaks the
  `SecretsProvider` Rule" — env vars are the **correct and only** channel in
  CI. Do not treat the generated workflow's `env:` block as a secrets-handling
  violation.
- `agent-runner/src/context.ts:30-32` — `PrContext.isFork` is *"informational
  only; the workflow itself is responsible for never scheduling this job for
  fork PRs"*. `src/run.ts` has no fork handling. An unguarded workflow is the
  **whole** exposure (D17/AC-60).
- `agent-runner/src/manifest.ts:37-44` — `findManifestPath` throws on zero
  **or more than one** manifest. This is the mechanism behind AC-59/P-6.
- `agent-runner/src/index.ts:30-50` — the env the runner actually reads:
  `DEVDIGEST_DIR`, `DEVDIGEST_RESULT_PATH`, `DEVDIGEST_POST_AS`,
  `OPENROUTER_API_KEY`; plus `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`
  via `run.ts` / `context.ts`. AC-11a's list is exactly this set.

### client

- `client/CLAUDE.md:13-15` — all data access goes through `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry,
  not inline literals (AC-48 says the same, plus "don't duplicate an existing
  key").
- `client/CLAUDE.md:21-28` — `src/vendor/shared` and `src/vendor/ui` are owned,
  drifted copies with no resync. `nav.ts` and `ExportWizardSteps.tsx` live in
  `vendor/ui` and are edited as owned source.
- `client/LEARNINGS.md:15-29` — `formatCost`: `null → "—"` vs `0 → "$0.00"`
  (finding 3, AC-27).
- `client/LEARNINGS.md:179-196` — filter chips count the filtered list
  (finding 4, AC-28).
- `client/LEARNINGS.md:220-241` — `TraceBody.tsx` does **not** render
  `PromptAssembly` generically; each field needs three explicit additions. AC-30's
  "not available for CI runs" branches are explicit per section, not a loop.
- `client/LEARNINGS.md:244-263` — `Markdown.tsx` sets no `urlTransform` and no
  `rehype-raw`. AC-54 is satisfied by rendering artifact agent names, repo
  names, PR titles, failure reasons and generated file contents as **plain JSX
  text nodes** (React-escapes them); no `dangerouslySetInnerHTML`, no new
  `Markdown` plugin.
- `client/LEARNINGS.md:299-315` — count the `../` depth to `messages/en/*.json`
  in a test file; measure, don't guess.
- `client/LEARNINGS.md:316-361` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks Next's webpack build with a misleading
  error; import from `@devdigest/shared/contracts/eval-ci` (or
  `.../productionize`). Also: passing typecheck + vitest is **not** evidence
  the page renders — `pnpm build` is.
- `client/LEARNINGS.md:362-403` — the four wirings; `nav.ts`'s `NAV` is the one
  that fails silently. Update `SHORTCUTS` in the same file (finding 1, P-11).
- `client/LEARNINGS.md:417-439` — a mutation hook writing `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:440-453` — a component calling `useToast()` needs
  `vi.spyOn`, not a provider, in tests.
- `client/LEARNINGS.md:486-503` — `activeKeyFor`'s substring-match bug class
  (finding 1).
- `client/LEARNINGS.md:578-593` — `api.postWithStatus` for an idempotent create
  (finding 5, AC-7).
- `client/src/lib/hooks/onboarding.ts`, `.../brief.ts` — the polling-hook
  precedent AC-29 needs: a `refetchInterval` that returns an interval only
  while the surface is live, and `cancelQueries` in `onMutate`.
- `client/src/app/skills/page.tsx` — the thin **workspace-scoped** route
  template both new pages need (`client/LEARNINGS.md:404-416` warns against
  reaching for the repo-scoped one; neither of these is repo-scoped —
  AC-26/AC-40).

## Approach

### Phase A — Foundation

#### A0. Pull in `agent-runner` (AC-52, precondition)

Not authored (N5). From the repo root:
`git checkout upstream/lesson-7-lab/agent-runner -- agent-runner/`, then
`pnpm --dir agent-runner install && pnpm --dir agent-runner run build`.
Confirm afterwards:

- `agent-runner/tsconfig.json`'s `paths` resolve `@devdigest/shared` to
  `../server/src/vendor/shared/index.ts` and `@devdigest/reviewer-core` to
  `../reviewer-core/src/index.ts` — i.e. the **server** copy is what the runner
  typechecks against, which is why AC-49's contract edits must land there
  first.
- `agent-runner/dist/` contains **three** files (P-2). If `ncc` emits a
  different chunk set on this machine, the bundle assembler must copy the
  directory, not an enumerated list — write it that way regardless.
- `agent-runner` gains its own entry in the root `CLAUDE.md` Map table (it has
  a `CLAUDE.md` and a `README.md` already, and the table is the documented way
  a module is discoverable).

#### A1. Shared contracts — `eval-ci.ts`, `productionize.ts`, `knowledge.ts`, `adapters.ts`, in BOTH copies

Apply every edit to `server/src/vendor/shared/**` **and**
`client/src/vendor/shared/**`. Today's `eval-ci.ts` diff is exactly two hunks
(the `AgentManifest` block + `ConformanceInput.provider`'s third enum value) —
AC-49 requires **both** to close, not merely to stay the same size.

`eval-ci.ts`, the `Export-to-CI + CI Runs` block (`:236-344`):

| Symbol | Change |
|---|---|
| `CiTarget` (`:238`) | unchanged. Only `gha` gets a generator (N1/D13). |
| `CiFile` (`:242-247`) | **reshaped**: `contents` → `z.string().nullable()` (null = not inlined, P-4), add `bytes: z.number().int()` and `sha256: z.string()`. `editable` stays. |
| `AgentManifest` (`:249-277`) | unchanged in the server copy; **ported verbatim to the client copy** (AC-49), along with `Provider`'s `openrouter` id in `knowledge.ts`. |
| `CiExportInput` (`:280-288`) | **reshaped**: `triggers` → `z.array(z.enum(['opened','synchronize','reopened']))` with the AC-4 default `['opened','synchronize']` (**not** `reopened` — today's default includes it and AC-4 says it must not). `action`, `post_as`, `base`, `repo`, `target` unchanged. No gate field — see below. |
| `CiInstallation` (`:291-298`) | **widened**: add `branch`, `base`, `pr_url: nullable`, `post_as`, `triggers`, `workflow_path`, `last_export_at`, `last_refreshed_at: nullable`, `last_run: CiRunSummary.nullable()` (AC-36). |
| `CiExport` (`:301-306`) | add `created: z.boolean()` is **not** needed — the HTTP status carries it (finding 5). Add `reused_pr: z.boolean()` and `warnings: z.array(z.string())`. |
| `CiRunStatus` (`:308`) | unchanged (`succeeded / failed / no_findings / running`) — already exactly finding 7's four states. |
| `CiRun` (`:311-325`) | **reshaped**: `status` → `CiRunStatus`; add `repo`, `agent_id: nullable`, `agent_run_id: nullable`, `provider_run_id`, `commit: nullable`, `critical`/`warning`/`suggestion` (`z.number().int().nullable()`), `duration_ms: nullable`, `duration_source: z.enum(['artifact','provider']).nullable()`, `failure_reason: nullable`, `pr_title: nullable`, `pr_href: nullable` (AC-32 — the studio path when the PR is imported, else the provider URL, resolved server-side). Drop `duration_s` in favour of `duration_ms`. |
| `CiResultArtifact` (`:329-344`) | **unchanged** — it is what the runner already emits (`agent-runner/src/artifact.ts`), and N5 forbids changing that. |
| `CiRunEnvelope` | **new** (P-3): `{ schema_version: z.literal(1), commit: z.string(), repository: z.string(), pr_number: z.number().int(), run_id: z.string(), runner_exit: z.number().int() }`. |
| `CiSecretStatus` | **new** (AC-64/P-7): `{ name, required: z.boolean(), state: z.enum(['configured','missing','unknown']), provided_by_ci: z.boolean() }`. **No value field, ever.** |
| `CiPreview` | **new**: `{ files: z.array(CiFile), secrets: z.array(CiSecretStatus), warnings: z.array(z.string()) }`. |
| `CiTargetOption` | **new** (AC-2/AC-2a): `{ target: CiTarget, label_key: z.string() }` — the registry's projection. |
| `CiRunsPage` | **new**: `{ runs: z.array(CiRun), agents: [...], repos: [...] }` — the filter vocabularies come from the same read (AC-28). |
| `CiRefreshResult` | **new** (AC-29): `{ checked: int, ingested: int, failed: int, skipped_debounced: int, degraded: z.boolean(), reason: z.string().nullable() }`. `degraded` is the rate-limit path: "could not refresh, showing stored data", never an emptied list. |

`productionize.ts`, the `Agent Performance` block (`:135-186`):

| Symbol | Change |
|---|---|
| `AgentPerfRow` (`:139-162`) | add `local_runs: int`, `ci_runs: int`, `avg_duration_ms: nullable`, `accept_rate_direction: z.enum(['up','down','flat']).nullable()` (AC-42's direction of travel), and make `accept_rate` explicitly `null` when no human-triaged finding exists in range (AC-46 — **not applicable, not zero**). |
| `AgentPerf` (`:172-186`) | add `range_days: z.union([z.literal(7), z.literal(30), z.literal(90)])` (D12/AC-43) and `has_ci_runs: z.boolean()` so the client can render AC-46's statement from i18n rather than a server-authored sentence (plan 12's `EvalCallout` precedent). |

`adapters.ts` — three new `GitHubClient` methods (P-13 governs the client copy):

- `listWorkflowRuns(repo, workflowPath, opts)` → run id, `head_sha`,
  `status`, `conclusion`, `created_at`, `updated_at`, `html_url`, PR number,
  `run_attempt`.
- `listRunArtifacts(repo, runId)` → `{ id, name, size_in_bytes, expired }[]`;
  `downloadArtifact(repo, artifactId)` → `Uint8Array` (a ZIP).
- `listActionsSecretNames(repo)` → `string[] | null`; **`null` means "not
  permitted to look"** (P-7), never an empty list.

#### A2. Schema + one migration

`server/src/db/schema/ci.ts`. Confirm zero rows first (finding 9).

**`ci_installations`** — add `workspaceId` (uuid, NOT NULL, FK → `workspaces`,
cascade — P-5), `branch`, `base`, `postAs`, `triggers` (jsonb `string[]`),
`workflowPath`, `prUrl` (nullable), `lastExportAt`, `lastRefreshedAt`
(nullable — AC-29's per-installation debounce). Add
`uniqueIndex('ci_installations_ws_repo_uq').on(workspaceId, repo)` (P-6/AC-59)
and `index(...).on(workspaceId, agentId)`.

**`ci_runs`** — add `workspaceId` (NOT NULL FK, P-5), `repo` (text, NOT NULL —
denormalised so an orphaned run still renders, spec §Edge cases),
`providerRunId` (text, NOT NULL), `agentRunId` (uuid FK → `agent_runs`, set
null), `agentName` (text — the artifact's recorded name, AC-22), `commit`,
`critical`/`warning`/`suggestion` (integer, nullable), `durationMs`,
`durationSource` (text enum `['artifact','provider']`), `failureReason`,
`ingestedAt`. Tighten `status` to `text(..., { enum: [...CiRunStatus] })`
NOT NULL. Add
`uniqueIndex('ci_runs_ws_provider_run_uq').on(workspaceId, providerRunId)`
(P-6/AC-19) and `index(...).on(workspaceId, desc(ranAt))`.

`ci_runs.ci_installation_id` keeps its `ON DELETE SET NULL` and
`ci_installations.agent_id` keeps its cascade (`schema/ci.ts:7-9,16-18`) —
that is the spec's stated orphan behaviour, and P-5's `workspace_id` is what
makes it survivable.

`pnpm db:generate < /dev/null` → **one** file → `pnpm db:migrate`.

#### A3. Adapter implementations

`adapters/github/octokit.ts` — the three methods, each wrapped in the existing
`withRetry(() => withTimeout(...))` (`:235-300` precedent). `listActionsSecretNames`
catches a 403 and returns `null` (P-7). `downloadArtifact` follows the redirect
Octokit issues and returns raw bytes, **size-capped** before buffering.

`adapters/mocks.ts` — matching mock methods with recorded inputs and settable
fixtures, beside the existing `openedPrs` / `committed` recorders
(`mocks.ts:218-231`). Tests swap the mock, never the module
(`server/CLAUDE.md:17-18`).

#### A4. `AppConfig` + container

One `AppConfig` entry: `agentRunnerDistDir`, defaulting to the repo-root
`agent-runner/dist`, overridable by env. This is what makes AC-52's
"runner absent → stated precondition" testable hermetically (point it at a
nonexistent directory) instead of requiring an uninstall.

`platform/container.ts` — `get ciRepo(): CiRepository` and
`get ciService(): CiService`, copying `briefRepo`/`briefService`'s lazy shape
(`:210-229`). `CiService` receives the repo, the agent/skill/memory lookups
(structural ports), `() => this.github()`, `this.config.agentRunnerDistDir`
and a logger. `container.github()` is **async** and throws `ConfigError`
(`:342-348`) — the service must translate that per `server/LEARNINGS.md:150-166`.

#### A5. Module registration

`modules/ci/` folder with placeholder `routes.ts`, plus one import + one entry
in `src/modules/index.ts` (`server/CLAUDE.md:15-16`).

**Phase A files:** `agent-runner/**` (added), both `vendor/shared/contracts/
{eval-ci,knowledge,productionize}.ts`, both `vendor/shared/adapters.ts`,
`server/src/db/schema/ci.ts`, one new migration,
`server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`,
`server/src/platform/{config,container}.ts`, `server/src/modules/index.ts`,
`server/package.json` (`yaml`, `verify:l07`), root `CLAUDE.md` (Map row).

### Phase B — Generation (pure, security-critical)

Every file in this phase is a pure function: no DB, no network, no `fs` beyond
reading the runner dist. That is what makes AC-9's byte-identical assertion and
AC-16's hostile-input assertions cheap to test.

#### B1. `modules/ci/constants.ts`

Every value carries its rationale in a comment: `BRANCH = 'devdigest/ci'`,
`PR_TITLE`, `DEVDIGEST_DIR = '.devdigest'`, `RUNNER_DIR = '.devdigest/runner'`,
`WORKFLOW_PATH = '.github/workflows/devdigest-review.yml'`,
`REQUIRED_SECRET = 'OPENROUTER_API_KEY'` (P-7), `ARTIFACT_NAME`,
`ENVELOPE_FILENAME = 'devdigest-run.json'`, `MAX_ARTIFACT_BYTES`,
`MAX_ARTIFACT_ENTRIES`, `REFRESH_DEBOUNCE_MS` (≤ 30 s per AC-29),
`CREDENTIAL_PATTERNS` (AC-63), and `PINNED_ACTIONS` — each official action as
`owner/repo@<40-hex-sha>` with a trailing `# vX.Y.Z` comment (AC-62). The SHAs
are resolved **once, by hand, at implementation time** and embedded; they are
never looked up per export (spec §Inputs).

#### B2. `modules/ci/targets.ts` — the generator registry (AC-2, AC-2a, D13)

A plain `Record<CiTarget, TargetGenerator>` holding **one** entry (`gha`), and
a `listTargets()` that projects the registered keys to `CiTargetOption[]`. The
route and the Target step read that list, so AC-2a ("registering a second stub
generator makes a second option appear with no edit to the Target step") is
literally true. Deliberately a list, not a plugin system (N1).

#### B3. `modules/ci/manifest.ts` (AC-12, AC-16)

`renderAgentManifest(agent, skillSlugs) → string`, emitted with `yaml`'s
`stringify` (P-9) from an object that has first been validated by
`AgentManifest.parse` — so an invalid manifest can never be written. Fields
come from the agent's stored configuration at generation time: name, provider,
model, system prompt, skill slugs, strategy, `ci_fail_on`.

**The gate value is read from the agent row, not from the export request.**
AC-35 says the CI tab's control "sets the agent's stored gate policy", and AC-9
says the bundle is generated "from stored agent configuration". So AC-4c's
"changing the gate regenerates the preview" is: persist to the agent, then
re-request the preview. No gate override is plumbed through `CiExportInput`,
and there is exactly one source of truth for `ci_fail_on`.

#### B4. `modules/ci/workflow.ts` (AC-11, AC-11a, AC-11b, AC-16, AC-60, AC-61, AC-62)

`renderWorkflow(input) → string`, emitted with `yaml`'s `stringify` from a
structured object (P-9), never string concatenation. Required properties, each
tied to its AC — no literal YAML is given here on purpose; build it from this
checklist and assert each row in a test:

| Element | Requirement |
|---|---|
| Trigger | `pull_request` **only**, with `types` exactly the selected subset of `opened`/`synchronize`/`reopened`. **No `pull_request_target`, ever** (AC-60, D17, N14). |
| Fork guard | The job's `if` additionally skips a fork-headed PR, evaluated from `github.event.pull_request.head.repo.fork` (AC-60). Nothing in the runner guards this (`context.ts:30-32`). |
| Permissions | An explicit top-level block, never inherited: `contents: read` and `pull-requests: read` always (the runner fetches the diff via the pulls API — `agent-runner/src/github.ts:30-44`); `pull-requests: write` **only** when `post_as` is `github_review` or `pr_comment` (AC-61). |
| Steps | checkout → setup-node (Node 22) → run runner → write envelope → upload artifact. Every `uses:` pinned to a full commit SHA (AC-62); **no `uses:` referencing a DevDigest action** — there is none (AC-11, D14). No `npm install` step: the ncc bundle has no runtime `node_modules` dependency (`agent-runner/CLAUDE.md` §Consuming). |
| Run step | A **fixed constant string** executing the bundle entrypoint under `.devdigest/runner/`. Zero interpolation of anything (AC-16, D11). |
| Env | `OPENROUTER_API_KEY` from repository secrets **by name**; `GITHUB_TOKEN` from the CI-provided token; `GITHUB_REPOSITORY` and `PR_NUMBER` from GitHub context; `DEVDIGEST_POST_AS` from a closed enum. Exactly the set `agent-runner/src/index.ts:30-50` + `context.ts` read, none omitted (AC-11a). No secret **value** is ever written (AC-15). |
| Envelope step | `if: always()`; writes `devdigest-run.json` from `env:`-passed context only (P-3). |
| Upload step | `if: always()` so a gate-triggered non-zero exit still publishes (AC-11b); uploads both the runner's result document and the envelope. |

**Why AC-16 is cheap here:** the PR title and body never enter the workflow at
all — the runner reads them itself from `GITHUB_EVENT_PATH`
(`agent-runner/src/context.ts:44-58`). The only variable data in the whole
document are a closed enum, an integer, and GitHub's own context expressions.

#### B5. `modules/ci/memory.ts` + `bundle.ts` (AC-3, AC-13, AC-14, AC-52, AC-58, AC-58a)

`renderMemoryJsonl(rows) → string`: one JSON object per line, carrying **only**
`kind` and `content` (D16/N15/N16). Never `embedding`, never `sources`, never a
`global`/`team`-scoped row. Zero matching rows → a valid empty document, never
an omitted file and never a failed export (AC-58a) — which, given the sibling
feature owns the only writer, is the **common** path, so build it first.

`bundle.ts` assembles the ordered `CiFile[]`: workflow, manifest, one skill
body per slug in the manifest (AC-13), the runner directory copied wholesale
(P-2), and `.devdigest/memory.jsonl`. Runner absent → a
`PreconditionError` naming the missing package and the build command, mapped to
a 4xx, **not** a bundle with a missing executable (AC-52). Every entry gets
`bytes` + `sha256`; only the workflow and the manifest are `editable: true`.

**Phase B files:** `server/src/modules/ci/{constants,targets,manifest,workflow,
memory,bundle,runner-dist}.ts` + their unit tests.

### Phase C — Export / install

#### C1. `modules/ci/repository.ts` and `ports.ts`

`repository.ts` is the **only** file in the module importing `src/db/**`
(`.dependency-cruiser.cjs:51-62`). It owns `ci_installations` / `ci_runs` CRUD
plus the read-only lookups this feature needs, every one workspace-scoped in
its `WHERE` clause (AC-24): the agent + its linked skill bodies, the repository
row matching an `owner/name` (for the memory join and AC-32's studio link), the
repo-scoped `memory` rows (D16 — a minimal read of its own, per the spec's
§Sibling note; **reuse the sibling's `MemoryRepository` read if one exists by
implementation time**), and the `agent_runs` / `findings` aggregates Phase D
needs.

`ports.ts` declares narrow local interfaces satisfied structurally
(`server/LEARNINGS.md:206-290`) — no import from any other module.

#### C2. `CiService` — export and install (AC-5 … AC-10a, AC-37, AC-59, AC-64)

`preview(workspaceId, agentId, input)`: resolve the agent workspace-scoped →
404 before any `ci_installations` row is read (AC-24); generate the bundle
(zero LLM calls, AC-9/AC-25); look up secret **names** (AC-64/P-7); return
`CiPreview`.

`export(workspaceId, agentId, input)`:

1. Resolve the agent workspace-scoped → 404 (AC-24).
2. Look up an existing installation for `(workspaceId, repo)`. Different agent
   → refuse with the stated reason, no row written (AC-59/P-6). Same agent →
   this is a republish (AC-7/AC-37).
3. Resolve the GitHub client **before** writing anything; translate
   `ConfigError` → 422 naming the missing credential
   (`server/LEARNINGS.md:150-166`, AC-10a). Zero installation rows on failure.
4. `action: 'files'` → return the bundle, write no installation row, make no
   provider call. This path is **never** gated on write access (D3/AC-10).
5. `action: 'open_pr'` → `commitFiles` onto the fixed branch (create-or-
   fast-forward, already idempotent — `adapters.ts:157-160`), then `findOpenPr`
   → reuse its URL, else `openPullRequest`. This is AC-7's "one installation,
   one PR, a new commit", and it is also the spec's "closed PR then Update CI
   config" edge: an open PR is found and reused, or a new one is opened for the
   same branch — a closed one is never resurrected.
6. Upsert the installation (agent, repo, target, branch, base, post_as,
   triggers, workflow path, pr_url, installed_at / last_export_at) — AC-8.
7. Respond `201` on a first install, `200` on a reuse (finding 5).
8. One structured log line: repo, installation id, file count, PR url, action.
   **Never** a credential, a system prompt, a skill body or a memory content
   (AC-55, spec §Privacy of logs).

`archive(workspaceId, agentId, input)` streams a `zipSync` of the same bundle
(P-8/AC-10).

#### C3. Routes (Phase C half)

```
GET    /ci/targets                     → CiTargetOption[]        (AC-2, AC-2a)
POST   /agents/:id/ci/preview          → CiPreview               (AC-3, AC-4c, AC-9, AC-64)
GET    /agents/:id/ci/preview/file     → { path, contents }      (P-4, AC-3)
POST   /agents/:id/export-ci           → CiExport                (AC-5…AC-10a, AC-37, AC-59)
GET    /agents/:id/ci/bundle.zip       → archive bytes           (AC-10)
GET    /agents/:id/ci/installations    → CiInstallation[]        (AC-34, AC-36, AC-39)
```

`getContext` first on every one; zod `params`/`body`; no `src/db` import
(`server/CLAUDE.md:12-14`, `modules/brief/routes.ts:1-42`). A per-route rate
limit on `POST /agents/:id/export-ci` (it opens PRs in someone else's
repository) — the per-IP-vs-per-workspace nuance of the stock
`@fastify/rate-limit` registration is a code comment, not a custom
`keyGenerator` (plan 12's finding 11).

### Phase D — Ingest + read surfaces

#### D1. `modules/ci/artifact.ts` — the untrusted boundary (AC-18, AC-63)

Pure. `readArtifactZip(bytes)` follows P-8's guard posture, then
`safeParse`s the result document against `CiResultArtifact` and the envelope
against `CiRunEnvelope`. `scanForCredentialShapes(document)` walks every string
field against `CREDENTIAL_PATTERNS` and, on a hit, returns the **pattern name
only** — the matched value is never returned, logged, stored or rendered
(AC-63, AC-55).

#### D2. `modules/ci/ingest.ts` — pure normalisation (AC-18 … AC-23)

`normalise(providerRun, artifact, envelope, installation)` →
`{ ciRun, agentRun, trace } | { failed, reason }`. All four AC-18 checks live
here, each producing a distinct stated reason:

| Check | Source |
|---|---|
| Caller is a workspace member | the route's `getContext` + the workspace-scoped installation read (AC-24) — the only one of the four that is *not* in this pure function |
| Document conforms to `CiResultArtifact` | `safeParse` |
| Commit reviewed == commit built from | `envelope.commit` vs `providerRun.head_sha` (P-3) |
| Artifact repository == installation repository | `envelope.repository` vs `installation.repo` |

Any failure → a `ci_runs` row with `status='failed'`, the failing check named
in `failure_reason`, and **no field from the document stored** (AC-18). Status
mapping otherwise follows finding 7. No artifact at all → `failed` with the PR
number, time and provider URL, null counts and null cost (AC-21). An artifact
naming an unknown agent → still ingested, attributed via the installation, the
recorded name displayed (AC-22). Per-finding cross-agent attribution
(SPEC-13's contract) is **not** consulted in this slice — `CiResultArtifact`
carries no findings (N4), so agent-level attribution, which already exists, is
sufficient and ingestion never blocks on the sibling (AC-23, D8).

#### D3. `CiService` — refresh, reads, performance (AC-17, AC-19, AC-24, AC-25, AC-29, AC-41 … AC-47)

`refresh(workspaceId, { force })`: for each installation in the workspace,
skip when `lastRefreshedAt` is inside `REFRESH_DEBOUNCE_MS` and `force` is
false (AC-29's "at most once per installation per interval"); otherwise list
completed provider runs of that installation's workflow path, ingest each one
not already ingested, and upsert with `ON CONFLICT DO UPDATE` on
`(workspace_id, provider_run_id)` (AC-19/P-6). A provider rate-limit or error
sets `degraded` with a reason and returns the **stored** rows — never an
emptied list (spec §Edge cases). A successful ingest writes three rows: the
`ci_runs` row, an `agent_runs` row with `source='ci'` and a nullable `pr_id`
(D7/AC-20), and a `run_traces` row for AC-30 (finding 6).

`listRuns(workspaceId, filters)` reads **stored rows only** — zero provider
calls, zero LLM calls (AC-25). It resolves `pr_href` server-side: the studio
path when the repository and PR are imported, else the provider URL (AC-32).

`performance(workspaceId, rangeDays)` (P-10) aggregates `agent_runs` over the
range across **both** sources (AC-45), computes accept rate **only** from
human-accepted/dismissed findings and returns `null` — not `0` — when an
agent's runs in range are entirely CI-sourced (AC-46), and returns
`has_ci_runs` so the client renders the explanatory statement from i18n. A
workspace holding only `source='local'` rows must produce identical numbers to
today (spec §Edge cases). Aggregation is pure code over stored rows, never
model-authored (spec §Inputs).

#### D4. Routes (Phase D half)

```
GET    /ci/runs                        → CiRunsPage              (AC-25, AC-27, AC-28, AC-31, AC-32)
POST   /ci/runs/refresh                → CiRefreshResult         (AC-17, AC-29)  [rate-limited]
GET    /agents/performance             → AgentPerf               (AC-40…AC-47)   querystring: range=7|30|90
```

Fastify ranks a static segment above a param, so `/agents/performance` (this
module) and `/agents/:id` (the agents module) coexist without reordering.

### Phase E — Client

#### E1. Hooks and wiring

`client/src/lib/hooks/ci.ts` (+ one line in `hooks/index.ts`): `useCiTargets`,
`useCiPreview`, `useCiPreviewFile`, `useExportCi`, `useCiInstallations`,
`useCiRuns`, `useRefreshCiRuns`, `useAgentPerformance`. Import contracts from
`@devdigest/shared/contracts/eval-ci` / `.../productionize`, **never** the bare
barrel (`client/LEARNINGS.md:316-361`). `useCiRuns`'s `refetchInterval`
returns an interval only while the page is visible — bind it to the
`visibilitychange`/`document.hidden` state, which is AC-29's "suspend while
hidden" — and `useRefreshCiRuns` uses `cancelQueries` in `onMutate` before any
`setQueryData` (`client/LEARNINGS.md:417-439`). `useExportCi` uses
`api.postWithStatus` (finding 5/AC-7).

`nav.ts` — two `NavItemDef` entries and two `SHORTCUTS` entries (P-11). Add
them **without deleting or renaming the sibling Multi-Agent Review feature's
entries** (AC-51); re-verify navigation after the first worktree merges, as the
spec requires. `helpers.ts` needs **no** edit (finding 1).

#### E2. Export wizard (AC-1 … AC-10a, AC-59 message, AC-64)

`client/src/app/agents/[id]/_components/CiExportWizard/` (colocated, per
`client/CLAUDE.md:16-17`), driven by the existing
`ExportWizardSteps` primitive (`vendor/ui/ExportWizardSteps.tsx`) with the four
labels already in `ci.json:exportWizard.steps`. Order is Target → Preview →
Configure → Install (D4): Target captures the CI-system card **and** the
`owner/name` repository (`ci.json` already carries `repoLabel`/`repoHint`/
`repoPlaceholder`); Preview renders the file list from the agent's current
stored config; Configure edits triggers/post-as/gate and **re-requests** the
preview (AC-4c). Target renders exactly one option and **no element at all**
referencing CircleCI, Jenkins or Generic CLI (AC-2) — note that `ci.json`
carries labels for all four; leaving them unread is correct, deleting them is
not required. Configure carries AC-4b's guidance as **visible text**, not a
tooltip. Install offers both the PR and the archive as concurrent choices with
the PR badged recommended (AC-10), and names the LLM-credential secret while
stating the repository token is automatic (AC-6).

#### E3. Agent editor CI tab (AC-33 … AC-39)

Append `{ key: "ci", labelKey: "editor.tabs.ci", icon: "Zap" }` to `TABS`
(`AgentEditor/constants.ts:12-17`; the i18n key exists — finding 2) and one
branch in `AgentEditor.tsx`. `_components/CiTab/` renders the deployment count
(AC-34), the three-way gate control mapping Critical→`critical`,
Warning+→`warning`, Never→`never` (D10/AC-35 — `any` stays valid and settable
on the Config tab, but is not offered here), the per-installation rows with
last-run status and time (AC-36), "Update CI config" (AC-37), "Add repository"
entering the wizard with the agent pre-chosen (AC-38), and the not-deployed
empty state with no list (AC-39).

*(Seam: if Phase E needs splitting, split here.)*

#### E4. CI Runs page (AC-26 … AC-32)

`client/src/app/ci-runs/page.tsx` — thin, on `src/app/skills/page.tsx`'s
workspace-scoped template (**not** the repo-scoped one —
`client/LEARNINGS.md:404-416`). `_components/CiRunsView/` renders the table
(AC-27, reusing `formatCost` for the null-vs-zero distinction — finding 3), the
five composed filters counted after filtering (AC-28, finding 4), the
auto-refresh + manual control (AC-29), the empty state with no table at all
(AC-31), and the PR link resolution (AC-32, computed server-side).

AC-30 reuses the existing `RunTraceDrawer`. Per
`client/LEARNINGS.md:220-241`, `TraceBody.tsx` renders each `PromptAssembly`
field explicitly — so the "not available for CI runs" branches are four
explicit per-section conditions (prompt assembly, tool calls, raw model output,
live log), each accompanied by a link out to the provider run. No contract
change (finding 6).

#### E5. Agent Performance page (AC-40 … AC-47) + cross-cutting

`client/src/app/agent-performance/page.tsx` + `_components/AgentPerfView/`:
the four summary tiles (AC-41), the sortable agent table with accept-rate
direction (AC-42), the fixed 7/30/90 preset selector defaulting to 30 (D12/
AC-43), the two cost breakdowns by agent and by model with naming legends
(AC-44), AC-46's not-applicable accept rate plus its explanatory statement
rendered from i18n on `has_ci_runs`, and AC-47's empty state with no figures.

Cross-cutting for the whole phase:

- **AC-48** — extend `ci.json`, `agentPerformance.json` and `shell.json`; do
  not create a new namespace and do not duplicate an existing key. Keys the
  reserved namespaces **do not** cover and that must be added: AC-4b's gate
  guidance, AC-64's per-secret states, AC-10's archive option, AC-59's refusal,
  AC-30's four unavailability strings, AC-46's statement, AC-31/AC-39/AC-47's
  empty states, and the source/status filter vocabularies.
- **AC-54** — every CI-supplied and agent-supplied string (artifact agent
  names, repository names, PR titles, failure reasons, previewed file contents)
  renders as a plain JSX text node. No `dangerouslySetInnerHTML`, no new
  `Markdown` plugin (`client/LEARNINGS.md:244-263`).
- **AC-56** — status, severity counts, accept-rate direction and every cost
  segment carry a text or glyph marker in addition to colour; each cost
  breakdown is accompanied by a readable table of the same values.
- **AC-57** — every wizard step, the gate control, the filters, the refresh
  control, the trace affordance and the range selector are real
  `<button>`/`<a>`/`<input>` elements; the CI-run status region is
  `role="status" aria-live="polite"` bound to the polled value.

### Explicitly not built

CircleCI / Jenkins / Generic CLI in any form including disabled cards (N1); a
GitHub App, OAuth flow or DevDigest-configured required status check (N2); any
inbound webhook or callback (N3); `findings` rows from CI (N4); any edit to
`agent-runner` (N5) or `reviewer-core` (N6); anything in
`contracts/observability.ts` (N7/AC-50); an MCP tool (N8); an e2e flow (N9);
SSE for CI runs (N10/D6); scheduling, retrying or cancelling a CI run (N11);
multi-agent CI deployment (N12/D18); cost budgets or quotas (N13); fork-PR
review (N14); `global`/`team`-scoped memory export (N15); embeddings or
semantic retrieval over memory (N16). Also **not** built: retention/pruning
(clarification 4), a memory reader in the runner (clarification 7),
re-export-on-memory-change (clarification 9), CI runs on the PR detail page
(clarification 3), and no-op-republish detection (clarification 5).

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (the routing
table at `:128-137`) and the catalog in `.claude/skills/README.md:9-24`. Load
the row matching the files you are editing **now**, not all at once; respect
each skill's declared scope. Phase 3's "cap at 4" is a review-pass budget, not
an implementation one.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/ci/**`, `server/src/platform/{container,config}.ts`, `server/src/modules/index.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3 rows for `server/src/modules/**`, `platform/**`, `adapters/**`. The ring rules and the local-port/DI pattern are the difference between `modules/ci/` passing `pnpm arch` with zero new baseline entries and eating several (`server/LEARNINGS.md:206-290`). `fastify-best-practices` for the schema-first zod bodies, the per-route `config.rateLimit`, and streaming the archive response. |
| `server/src/db/schema/ci.ts`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3 row for `server/src/db/**`. Two unique indexes carrying AC-19/AC-59, `NOT NULL` without a default on tables confirmed at zero rows, jsonb `$type<>()`, and the `ON DELETE SET NULL` orphan semantics P-5 has to survive. |
| both `vendor/shared/contracts/{eval-ci,knowledge,productionize}.ts`, both `vendor/shared/adapters.ts`, every route schema | `zod` | Phase 3 row for `**/contracts/**` and zod schemas. Also the `.nullable()`-makes-the-key-required trap (`server/LEARNINGS.md:483-497`) — deliberate for every AC-27 "not produced" field, wrong for optional inputs. |
| `server/src/modules/ci/{workflow,manifest,memory,artifact,ingest}.ts` | `security` | Phase 3's "any `.ts`/`.tsx`" row, and the sharpest need in this plan. Outbound: AC-16/D11 is arbitrary command execution in a third party's pipeline, AC-60 is the `pull_request_target` + fork-checkout secret-exfiltration class, AC-61 is least privilege, AC-62 is supply chain. Inbound: the artifact is an untrusted ZIP from a repository we do not control (AC-18, AC-63). Load this for Phase B and Phase D specifically, not as background reading. |
| `client/src/app/{ci-runs,agent-performance}/**`, `client/src/app/agents/[id]/_components/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3 row for `client/src/app/**`. Colocated `_components/<Name>/` folders, thin route files, the `"use client"` boundary, and the wizard's step-state ownership. |
| `client/src/lib/hooks/ci.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/run-trace-drawer/**` | `frontend-ui-architecture`, `react-best-practices` | Phase 3 rows for `client/src/lib/**` and `client/src/components/**`. The visibility-gated `refetchInterval` + `cancelQueries` pattern (AC-29) and the four-wirings rule for `nav.ts` (finding 1). |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3 row. |
| `agent-runner/**` | **none — do not edit** | N5. The file set is checked out verbatim and built; `git diff` against the upstream tree must be empty. |

**Routing gaps:** Phase 3's table has **no row for `agent-runner/**`** (finding
13, the same class of gap plans 09/10 flagged for `mcp-server/**`). It does not
bite here because this plan edits nothing in that package, but the table should
gain a row — the natural one is `typescript-expert` + `security`, mirroring the
`reviewer-core` row's posture of excluding `onion-architecture`. Everything
else this plan touches routes cleanly.

Root `CLAUDE.md` §"Before you finish": append an `engineering-insights` entry
to each touched module's `LEARNINGS.md` — at minimum `server/LEARNINGS.md`
(that the ncc "bundle" is three files and the two silent failure modes of
shipping one; that a reserved contract can be missing the exact field an AC
requires and N5 forces the check into the generated artifact instead — P-3;
whether the single-pass migration held) and `client/LEARNINGS.md` (a **third**
instance of the `:362-403` four-wirings entry, this time with both nav icons
already present, which is the opposite of plan 12's `BarChart3` surprise —
extend that entry rather than duplicating it).

## Verification

Scoped commands, per phase. `pr-self-review` re-runs the full suites before
push regardless, so nothing below is a blanket run. **Each phase's block must
be green before the next phase starts.**

### Phase A — Foundation

```
git checkout upstream/lesson-7-lab/agent-runner -- agent-runner/
pnpm --dir agent-runner install && pnpm --dir agent-runner run build
ls agent-runner/dist                                  # expect index.js, *.index.js, package.json
cd server && psql -c 'select count(*) from ci_installations; select count(*) from ci_runs;'
cd server && pnpm db:generate < /dev/null
cd server && pnpm db:migrate
cd server && pnpm typecheck && pnpm arch
cd server && pnpm exec vitest run test/contracts.test.ts test/ci-contract-parity.test.ts
pnpm --dir agent-runner run typecheck && pnpm --dir agent-runner test
cd client && pnpm typecheck
```

- Both counts must be `0` before generating; otherwise the `NOT NULL`-without-
  default columns need defaults (`server/LEARNINGS.md:38-54`).
- If `db:generate` hangs, it found a rename ambiguity — kill it and split the
  pass (`server/LEARNINGS.md:64-82`). Expect **one** migration file.
- `test/ci-contract-parity.test.ts` is AC-49's mechanical check: read both
  `eval-ci.ts` copies, both `productionize.ts` copies and both `adapters.ts`
  copies from disk and assert the CI/AgentPerf/GitHubClient regions are
  byte-identical. It must show the two pre-existing `eval-ci.ts` drift hunks
  **closing**, not merely holding.
- `pnpm arch` reports **zero new** violations. A failure means a cross-module
  import slipped in — replace it with a local port, do **not** run
  `arch:baseline` (`server/LEARNINGS.md:706-721`).

### Phase B — Generation

```
cd server && pnpm typecheck && pnpm arch
cd server && pnpm exec vitest run src/modules/ci/
```

- **Pass:** the generator suite is green, including the hostile-input cases.
  Assert explicitly that generating twice for an unchanged agent is
  byte-identical (AC-9) and that zero provider calls were made.

### Phase C — Export / install

```
cd server && pnpm typecheck && pnpm arch
cd server && pnpm exec vitest run src/modules/ci/ test/ci-export.it.test.ts
```

### Phase D — Ingest + reads

```
cd server && pnpm typecheck && pnpm arch
cd server && pnpm exec vitest run src/modules/ci/ test/ci-export.it.test.ts test/ci-ingest.it.test.ts
cd server && pnpm verify:l07
cd server && pnpm test
```

- `pnpm verify:l07` (new, beside `verify:l06` at `server/package.json:13`) runs
  the pure generator + ingest suites, the contract-parity test and the DB-backed
  CI integration tests.
- The **full** `pnpm test` is named here deliberately: this phase writes
  `agent_runs` and `run_traces` rows that every existing cost/latency/trace
  aggregation reads (D7), so a scoped run would not catch a regression it could
  cause. This is the only full-suite call in the plan.

### Phase E — Client

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/ci-runs/**" \
  "src/app/agent-performance/**" \
  "src/app/agents/[id]/_components/**" \
  "src/components/run-trace-drawer/**" \
  "src/lib/hooks/**"
cd client && pnpm build
```

- The `AgentEditor` and `run-trace-drawer` globs are **both** required: each is
  existing code with existing tests, and those tests are the regression check
  that the new tab and the new trace branches changed nothing else (AC-33's
  "without altering the behaviour of the existing tabs").
- `pnpm build` is **not optional** — typecheck + vitest do not prove the pages
  render, and this adds new `@devdigest/shared` consumers, the exact trap in
  `client/LEARNINGS.md:316-361`.
- **Pass:** `/ci-runs` and `/agent-performance` are reachable **by clicking the
  sidebar** (not just by typing the URL — finding 1), both respond to their
  shortcuts, the CI tab renders beside Config / Skills / Context / Evals, and
  the wizard completes against a stubbed GitHub client.

### Cross-cutting (before push)

```
diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts
diff server/src/vendor/shared/contracts/productionize.ts client/src/vendor/shared/contracts/productionize.ts
git status --porcelain server/src/db/migrations
git diff reviewer-core/ mcp-server/ e2e/ evals/
git diff upstream/lesson-7-lab/agent-runner -- agent-runner/
git diff -- server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts
```

- Both contract diffs must be **empty** in the CI/AgentPerf regions (AC-49).
- Exactly **one** new migration file, no edit to an existing one
  (`server/CLAUDE.md:31-32`).
- `git diff reviewer-core/ mcp-server/ e2e/ evals/` must be **empty** — N6, N8,
  N9.
- `git diff` against the runner's upstream tree must be **empty** — N5/AC-52.
- `observability.ts` must be untouched in both copies — N7/AC-50.

### Test matrix the scoped files must cover

| Test scenario | ACs |
|---|---|
| The wizard renders four step labels with the first active | AC-1 |
| The Target step renders exactly one option; no element referencing CircleCI, Jenkins or Generic CLI is present at all | AC-2 |
| Registering a second stub generator makes a second option appear with no edit to the Target step | AC-2a, D13 |
| Preview lists every bundle path — including the memory file and **every** file in `agent-runner/dist/` — each with editability marked | AC-3, AC-13, AC-14, P-2 |
| On first entry exactly `opened` + `synchronize` are selected, and the generated trigger list matches the selection | AC-4 |
| Post-as offers review / comment / none with review recommended | AC-4a |
| The gate-vs-required-check guidance is visible text, not a tooltip | AC-4b |
| Switching the gate policy changes the previewed manifest's `ci_fail_on`, with zero provider calls | AC-4c, AC-9 |
| Completing Install against a stubbed client records one commit and one opened PR, and surfaces the URL | AC-5 |
| Install names the LLM secret and does not instruct adding the CI-provided token | AC-6 |
| Exporting twice for the same agent+repo yields exactly one installation row and one PR URL, with a second commit | AC-7, AC-37 |
| The installation records agent, repo, target and install time | AC-8 |
| Generating the same bundle twice for an unchanged agent is byte-identical, against a stubbed provider with zero calls | AC-9 |
| Both PR and archive are selectable on Install for a writable repo; the archive is not gated on write access | AC-10 |
| With no credential, and separately with a non-writable one, the flow states which applies, writes zero installation rows, and still produces a downloadable bundle — as a 4xx, not a 500 | AC-10a, `server/LEARNINGS.md:150-166` |
| The generated workflow contains no `uses:` referencing a DevDigest action and runs the same path AC-14 requires in the bundle | AC-11, D14 |
| The run step defines every variable the runner reads and omits none | AC-11a |
| The publish step is not skipped on a failing gate | AC-11b |
| Parsing the generated manifest with `AgentManifest` succeeds and every field equals the agent's stored value | AC-12 |
| No generated file's contents match any value held by the secrets provider; the credential is referenced by secret name only | AC-15 |
| A workflow generated for an agent whose name contains shell metacharacters **and a newline** carries that text in no command step, and the manifest still round-trips the name intact | AC-16, D11 |
| A refresh queries the provider for completed runs of the installed workflow and ingests each un-ingested one | AC-17 |
| Four separate cases — unauthenticated, non-integer findings count, mismatched commit, mismatched repository — each produce a failed row naming the failed check and store no counts | AC-18, P-3 |
| A missing or unparseable envelope fails the commit check rather than passing vacuously | AC-18, P-3 |
| Refreshing three times over one completed provider run yields exactly one CI-run row, including under two concurrent refreshes | AC-19, P-6 |
| An ingested run produces one CI-run row and one agent-run row reading `ci`, and no local run's `source` changes | AC-20, D7 |
| A completed provider run with no artifact yields a failed row with null counts and a usable link out | AC-21 |
| An artifact naming a deleted agent still ingests, attributed to the installation, displaying the recorded name | AC-22 |
| Ingestion succeeds and attributes to its agent with SPEC-13's contract absent | AC-23, D8 |
| A request naming another workspace's agent, installation or run is refused before any CI row is read, on export, read, refresh and ingest | AC-24 |
| Loading CI Runs, the CI tab and Agent Performance against stubbed provider + GitHub produces zero provider calls and zero GitHub calls | AC-25 |
| An ingested run with a null cost renders a placeholder, not `$0.00`; a genuine zero renders `$0.00` | AC-27, finding 3 |
| The five filters apply together, and each chip's count equals what clicking it yields | AC-28, finding 4 |
| The list re-queries within 30 s while visible, stops while hidden, and the manual control queries immediately; the provider is queried at most once per installation per interval | AC-29 |
| A rate-limited refresh degrades to "showing stored data" and never empties the list | AC-29, §Edge cases |
| Opening a CI run's trace renders the shared drawer with ingested config/stats, states unavailability for the four local-only sections, and offers a provider link | AC-30, finding 6 |
| With no CI run ever ingested, the page states it and renders no table | AC-31 |
| A run whose repo+PR are imported links into the studio; one whose are not links to the provider | AC-32 |
| The CI tab is reachable by clicking and by the tab URL parameter, and the other tabs render unchanged | AC-33 |
| The CI tab states the deployment count | AC-34 |
| Changing the gate control persists the agent's policy and the next generated manifest carries the new value | AC-35, D10 |
| Each installation row shows repo, CI system, last-run status and time | AC-36 |
| "Add repository" enters the wizard with the agent pre-chosen | AC-38 |
| An agent with no installations states it and renders no list | AC-39 |
| Agent Performance is reachable from the sidebar and is not repo-scoped | AC-40, finding 1 |
| The page presents total runs, total cost, average accept rate and the most-active agent with its count | AC-41 |
| The agent table shows runs, avg cost, avg duration, accept rate with direction, last run and an open affordance, sortable by accept rate | AC-42 |
| Switching 30 days → 7 days changes the totals | AC-43, D12 |
| Cost is broken down by agent and by model, each with a naming legend | AC-44 |
| Ingesting a CI run increases the agent's run count and total cost on this page | AC-45 |
| An agent with only ingested CI runs shows a **not-applicable** accept rate, not zero, and the page carries the explanatory statement | AC-46 |
| With no agent run of either source in range, the page states it and renders no figures | AC-47 |
| A workspace holding only `source='local'` rows produces identical figures to before this feature | §Edge cases |
| Every surface reads its copy from the prepared namespaces, with no duplicated key | AC-48 |
| A mechanical comparison of the two `vendor/shared` copies reports no divergence in the touched contract regions, and the two pre-existing `eval-ci.ts` hunks are closed | AC-49 |
| This feature's diff contains no change to the SPEC-13 observability contracts | AC-50 |
| Both pages are reachable by clicking the sidebar, both respond to their shortcut, and the sibling's nav entries are present and unrenamed | AC-51, finding 1 |
| With the runner package absent, the export flow reports the missing precondition rather than producing a bundle with a missing executable | AC-52, A4 |
| An ingested run whose agent name contains a `<script>` tag renders as visible text | AC-54 |
| Exporting and ingesting with a configured credential produces no log line, row or rendered string containing that value | AC-55 |
| Status, severity counts, accept-rate direction and cost segments are distinguishable without colour; each chart has a non-graphical equivalent | AC-56 |
| Every wizard step, the gate control, the filters, the refresh, the trace affordance and the range selector are keyboard-operable; a status change is announced via `aria-live` | AC-57 |
| Three repo-scoped rows for the target repo plus rows for another repo export exactly the three, with no embedding and no source reference | AC-58, D16 |
| Zero matching rows still produce the memory file, parsing as an empty record set, and the export succeeds | AC-58a |
| Exporting a second, different agent into a repo with an existing installation is refused; the first installation and its bundle are unchanged | AC-59, P-6, D18 |
| The generated workflow declares no `pull_request_target` trigger and its job does not execute for a fork-headed PR | AC-60, D17 |
| Exit-code-only publishing grants no `pull-requests: write`; review publishing does | AC-61 |
| No `uses:` reference resolves to a tag or branch | AC-62 |
| An otherwise-valid artifact carrying a credential-shaped string in any field is rejected, and the value appears in no row, log line or rendered surface | AC-63 |
| The Configure step reports a configured/missing/**unknown** state per secret name, and no request returns a secret value | AC-64, P-7 |
| A gate-triggered non-zero exit is recorded as a **successful** review that requested changes, not a failed run | §Edge cases, finding 7 |
| An in-progress provider run appears as `running` or not at all — never as `failed` | §Edge cases |
| An orphaned CI run (agent deleted, installation cascaded away) renders without crashing and is still workspace-scoped | §Edge cases, P-5 |

`*.it.test.ts` for anything DB-backed (installation/run persistence, workspace
scoping, the unique-index idempotency, migrations); everything else hermetic
against a stubbed provider, a stubbed GitHub client and fixture rows
(`server/CLAUDE.md:47-50`).

### Manual acceptance beyond an automated run

The end-to-end CI demonstration is a human step after this plan lands, and its
preconditions are environment, not implementation (spec §Non-functional): a
fork of a demo repository with Actions enabled, a credential that can open a PR
there, and an `OPENROUTER_API_KEY` in that repository's Actions secrets. **The
implementation must not attempt to provision any of it**, and every command
above must pass without it, against a stubbed GitHub client (AC-53).
