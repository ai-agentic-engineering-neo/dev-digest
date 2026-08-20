# Export to CI — Implementation Plan

Worktree: `/Users/viktormashyka/Documents/GitHub/devdigest-ci`, branch
`feat/export-to-ci`. Every path below is relative to that root.

## Source requirements

`specs/14-export-to-ci.md` (SPEC-14, 72 ACs, status draft). This plan covers
**all** of them; each phase below lists the AC-ids it owns, so `plan-verifier`
and `architecture-reviewer` can trace phase → AC without re-reading the spec.

Coverage map (every AC lands in exactly one phase):

| Phase | ACs |
|---|---|
| P1 Foundation | 49, 50, 53 (migration half), and the storage/idempotency substrate for 19, 24 |
| P2 Generator | 2a (registry), 9, 11, 11a, 11b, 12, 13, 14, 15, 16, 52, 58, 58a, 60, 61, 62 |
| P3 Export/install | 5, 6 (payload), 7, 8, 10, 10a, 24 (export surface), 37, 59, 64, 4c (server half), 25 (export half) |
| P4 Ingest + reads | 17, 18, 19, 20, 21, 22, 23, 24 (read surfaces), 25 (read half), 27/32 (payload), 29 (server debounce), 30 (trace row), 41–47 (aggregation), 55, 63 |
| P5 Client | 1, 2, 2a (UI), 3, 4, 4a, 4b, 4c (UI), 5/6/10/10a (UI), 26–36, 38, 39, 40–44, 46, 47, 48, 51, 54, 56, 57, 59 (message), 64 (UI) |
| All phases | 53 (typecheck/tests per touched package) |

## Clarifications & recommendations

The product owner pre-decided four things; they are applied, not re-asked:
multi-agent execution capped at 3–5 implementer agents; **no new tests written
by any phase** (existing tests stay green; minimal edits allowed when a change
forces one); a downstream fix loop capped at 2 subagent invocations;
`plan-verifier` then `architecture-reviewer` run after implementation.

### Answers to the spec's own `[NEEDS CLARIFICATION]` items

1. **CI Runs list scope** — workspace-wide, at `/ci-runs`. Confirmed by the
   reserved `nav.ci-runs` label (`client/messages/en/shell.json`) and the
   already-present `activeKeyFor` branch (`client/src/components/app-shell/helpers.ts:48`).
2. **Which duration** — *(planner decision)* the runner's own review duration
   from the artifact (`CiResultArtifact.duration_ms`), falling back to the
   provider's job wall-clock when no artifact exists, and a placeholder when
   neither does. Store both source and value; the column header copy says
   "review time".
3. **CI runs on the PR detail page** — out of scope this slice (spec says a
   later addition needs no contract change). Do not touch the PR page beyond
   the one import move in P5.
4. **Retention** — no pruning. Known debt, unchanged.
5. **"Update CI config" on unchanged config** — always offered; no change
   detection. Narrow-scope posture (spec §Scope posture).
6. **Early repo-existence validation** — *(planner decision)* no per-keystroke
   provider call. The Target step validates `owner/name` shape locally; the
   Configure step's secret-name lookup (AC-64) is the first provider call and
   doubles as the existence/permission probe, so a bad repo surfaces one step
   before Install rather than at Install.
7. **Ship the inert memory file** — yes (D15/AC-58). Unchanged.
8. **Which secret names to check** — exactly one: `OPENROUTER_API_KEY`.
   `GITHUB_TOKEN` is reported as CI-provided, needing no action, with **no**
   lookup (AC-64, AC-6).
9. **Memory re-export staleness** — known debt, unchanged.

### Planner decisions the spec left open

- **D-P1 — Placement: `server/src/modules/ci/`.** Product-owner confirmed.
  Note this is *already* the path the runner's own docstrings name
  (`agent-runner/src/index.ts:5-6`, `src/context.ts:9-10`,
  `src/manifest.ts:12`), so SPEC-14's "the runner's docstrings should end up
  pointing at the real path" is satisfied with **zero edits to
  `agent-runner/src`** — N5 stays intact. Do not "fix" those docstrings.
- **D-P2 — The four-part ingest check needs a workflow-written sidecar file.**
  `CiResultArtifact` carries no commit sha and no repository
  (`server/src/vendor/shared/contracts/eval-ci.ts:329-344`), and the runner
  that produces it must not change (N5), so AC-18's "commit matches" and
  "repository matches" checks would be vacuous against the artifact alone.
  Resolution: the **generated workflow** uploads a second file,
  `devdigest-run.json`, alongside the runner's `devdigest-result.json`, in the
  same uploaded artifact. It carries `{ commit_sha, repository, pr_number }`
  written from GitHub context values passed through a step-level `env:` block
  — never interpolated into the `run:` body (AC-16, and GitHub's own
  script-injection guidance). Ingestion compares those *claimed* values
  against the provider-reported `head_sha` and the installation's stored repo;
  that comparison is what makes them meaningful. `CiResultArtifact` itself is
  **not modified** — it is compiled into the runner through the server's
  `vendor/shared` copy, so changing it would silently change the runner.
- **D-P3 — `ci_installations` and `ci_runs` gain `workspace_id`.** Both tables
  are empty and unread (spec §"reserved in six independent places"), so D1's
  reshape-in-place applies. Reaching the workspace only transitively (agent →
  workspace) breaks for the spec's own "agent deleted, runs survive orphaned"
  edge case, where `ci_runs.ci_installation_id` goes null and the row has no
  path to a workspace at all — AC-24 would then be unenforceable on exactly
  the rows that outlive their agent. A direct column also makes AC-59's
  "one agent per repository" a real unique index instead of a service-only
  check.
- **D-P4 — The memory read method goes on `modules/memory/repository.ts`, the
  sibling's file, not a second one.** SPEC-13's `MemoryRepository`
  (`findByFindingId`, `insertLearning` — sibling plan §B2) does **not** exist
  in this worktree yet; verified: `server/src/modules/memory/` is absent and
  `container.memoryRepo` has no hits. So the implementer creates that exact
  file path and class name with **only** `listRepoScoped(workspaceId, repoId)`
  on it, plus the `memoryRepo` container getter, matching the sibling's
  signature (`MemoryRepository(db)`, registers no route, exposes no HTTP
  surface). When `feat/multi-agent-review` merges first, the conflict is a
  method-level union inside one class, not two competing modules. The ci
  module consumes it through a narrow local port, never a direct import
  (`server/LEARNINGS.md:206` — `no-cross-module` fires on `service.ts` and
  `routes.ts` alike).
- **D-P5 — Auto-refresh polls stored rows; provider re-query is
  server-debounced.** `GET /ci/runs` never contacts GitHub (AC-25).
  `POST /ci/refresh` does, with an in-memory per-installation timestamp gate of
  30s; `force: true` (the manual control) bypasses it. That is how AC-29's
  "at most once per installation per interval" survives two tabs polling at
  once, and why AC-19's upsert must be idempotent regardless.
- **D-P6 — The generated workflow references three official actions, all
  SHA-pinned** (AC-62): `actions/checkout`, `actions/setup-node`,
  `actions/upload-artifact`. No third-party action, no DevDigest action
  (D14/AC-11). Resolved SHAs for the `v4` tags, verified against the API on
  2026-08-20 (all three tags point directly at a commit object):

  | Action | SHA (tag `v4`) |
  |---|---|
  | `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` |
  | `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
  | `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

  The implementer must re-resolve each with
  `gh api repos/<owner>/<repo>/git/ref/tags/v4 --jq .object.sha` and record the
  resolved version as a trailing `# v4.x.y` comment on the `uses:` line, then
  keep them in one `constants.ts` — never inline in the template.
- **D-P7 — `RunTraceDrawer` is promoted to `client/src/components/`.** AC-30
  requires the CI Runs page to reuse the *same* drawer, which today is
  colocated under `app/repos/[repoId]/pulls/[number]/_components/`. No
  cross-route `@/app/...` import exists anywhere in the client today, so
  importing it across routes would create a new bad precedent; the established
  shape for a cross-route component is `client/src/components/<name>/`
  (`diff-viewer`, `context-tab`, `page-shell`). This is a folder move plus two
  import-line edits (`PrDetailView.tsx:33` and the `vi.mock("../RunTraceDrawer")`
  path at `PrDetailView.test.tsx:96`) — the one existing-test edit this plan
  authorises.
- **D-P8 — Recommendation, not a requirement:** the runner bundle is a
  multi-hundred-KB single file. The Preview response still carries its full
  contents (AC-3 says "each with its full contents"), but the UI renders that
  one file collapsed behind its path + byte size, expandable on demand. Every
  other file renders expanded.

### Recommendations the reader should weigh

- **R-A** — SPEC-14's own AC-53/N9 assume server integration tests prove the
  ingestion path ("proved by server integration tests against a stubbed GitHub
  client"). The no-new-tests constraint means that proof does not ship. See
  **Risks**; the recommendation is a separate `test-writer` run scoped to
  `server/src/modules/ci/` immediately after this plan lands.
- **R-B** — `CiExportInput.triggers` currently defaults to
  `['opened','synchronize','reopened']`
  (`server/src/vendor/shared/contracts/eval-ci.ts:283`), which contradicts
  AC-4's "reopened unselected by default". This feature owns that contract;
  change the default to `['opened','synchronize']` in **both** vendor copies so
  the server fallback and the wizard default agree.

## Execution mode

**Recommendation: multi-agent, 5 `implementer` phases, sequential**, then
`plan-verifier`, then `architecture-reviewer` with its capped fix loop. Five
rather than three because the two security-bearing units — the workflow-YAML
generator and the ingest boundary — each need a phase whose entire scope is
small enough that a single implementer cannot lose an AC inside it, and
folding either into a broader "build the CI module" phase is exactly the
compression the task brief rules out.

Split rationale (by layer, then by vertical slice):

1. **P1 Foundation** — contracts (both `vendor/shared` copies), schema reshape
   + migration, `GitHubClient` port extensions, container wiring. Nothing
   downstream typechecks until this lands, and it is the only phase that
   touches `db/` and `adapters/`.
2. **P2 Generator (security)** — pure, dependency-free file generation.
   Deterministic, no DB, no HTTP, no LLM. Verifiable by generating a bundle and
   grepping it, which is exactly what the security ACs assert.
3. **P3 Export/install** — service + routes: idempotency, refusal rules,
   workspace scoping, secret-name reporting. Consumes P2 as a pure function.
4. **P4 Ingest (security) + read surfaces** — the untrusted-input boundary,
   plus the CI-runs and agent-performance read/aggregation routes that have no
   security surface of their own and would otherwise need a sixth phase.
5. **P5 Client** — four surfaces, nav wiring, i18n, drawer promotion.

**User's choice: _pending confirmation_.** The mode was pre-decided
(multi-agent, 3–5 agents); the exact count (5) and the split above are the
planner's, and the task asked for them to be stated rather than re-asked.
Confirm or override before handing P1 to `implementer`.

Fix-loop budget: 2 subagent invocations total, downstream. Each phase's own
verification gate below is therefore written to be run *by that phase*, before
handoff — a phase that hands off red spends the shared budget.

## Modules affected

- **`server`** — the whole export/ingest half: new `src/modules/ci/`, reshaped
  `src/db/schema/ci.ts` + one migration, both reserved contract files in
  `src/vendor/shared/contracts/`, `GitHubClient` port + Octokit adapter + mock,
  `platform/container.ts`, `modules/index.ts`, and a minimal
  `src/modules/memory/repository.ts` (D-P4). New route on the agents surface
  for performance aggregation.
- **`client`** — CI Runs page, Agent Performance page, agent editor CI tab,
  export wizard, sidebar/shortcut wiring, i18n key additions in the reserved
  namespaces, `RunTraceDrawer` promotion, `vendor/shared` contract parity.
- **`agent-runner`** — **source untouched (N5)**. One build artifact is
  produced and committed: `agent-runner/dist/index.js`, which `.gitignore:3-6`
  explicitly un-ignores ("its bundled `dist/` MUST be committed"). It does not
  exist in this worktree yet, and AC-14/AC-52 depend on it.
- **`reviewer-core`** — untouched (N6). Note the alias coupling: it and
  `agent-runner` both resolve `@devdigest/shared` to **server's**
  `vendor/shared` copy, so a change there reaches them immediately — the reason
  D-P2 leaves `CiResultArtifact` alone.
- **`e2e`, `mcp-server`, `evals`** — untouched (N8, N9).

## Architectural constraints

Cited, not paraphrased. Read the cited lines before writing the code they
govern.

### server

- Schema-first routes: every route declares zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse(req.body)`
  (`server/CLAUDE.md:12-15`).
- A new module is dead code until it is added to `src/modules/index.ts` — one
  import + one entry (`server/CLAUDE.md:15-17`, and the registry docstring at
  `server/src/modules/index.ts:17-29`). The one deliberate exception is
  `modules/memory/`, which registers nothing because it exposes no route
  (D-P4); say so in its docstring.
- Adapters sit behind `platform/container.ts` DI; tests swap
  `src/adapters/mocks.ts` — never mock at module level
  (`server/CLAUDE.md:17-19`).
- Secrets go through `SecretsProvider`, never `AppConfig`; `GITHUB_TOKEN` is
  canonical (`server/CLAUDE.md:19-22`, port at
  `server/src/vendor/shared/adapters.ts:281-288`).
- Migrations do not run on boot — `pnpm db:migrate` after any schema change
  (`server/CLAUDE.md:36-38`, root `CLAUDE.md` §Conventions).
- `server/src/vendor/shared` is an independent copy from client's; editing a
  contract in one does not propagate (`server/CLAUDE.md:27-31`,
  `server/LEARNINGS.md:198`).
- dependency-cruiser rules, all `severity: 'error'`
  (`server/.dependency-cruiser.cjs`):
  - `routes-are-adapters` (`:33-40`) — `routes.ts` may not import `src/db/` or
    `drizzle-orm`.
  - `db-only-in-repositories` (`:51-62`) — only `repository.ts` inside a module
    may import `src/db/`. The ci module's memory read and every CI query
    therefore live in a `repository.ts`, never in `service.ts` or a generator.
  - `no-cross-module` (`:64-74`) — no module may import another module's files.
    Use a narrow local port satisfied structurally, and wire the concrete
    instance in `routes.ts` or promote it to a container getter
    (`server/LEARNINGS.md:206-230`; live example: `modules/eval/ports.ts`).
  - `no-container-in-services` (`:42-49`) — `service.ts` may not import
    `Container`, even type-only.
  - After the phase, `pnpm arch` must be clean; if a *new* known-violation edge
    appears, `pnpm arch:baseline` regenerates the file — then diff it, because
    it silently swallows unrelated new violations (`server/LEARNINGS.md:706`).
- `ConfigError` responds HTTP 500 even for client-actionable conditions
  (`server/LEARNINGS.md:150`) — AC-52's "unmet precondition" and AC-10a's
  "credential cannot write" must therefore be `ValidationError` /
  `ExternalServiceError` (`platform/errors.ts:25,31`), not `ConfigError`.
- `*.it.test.ts` = DB-backed via testcontainers and self-skips without Docker;
  everything else is hermetic (`server/CLAUDE.md:47-50`).

### client

- All data access goes through `src/lib/hooks/*` → `src/lib/api.ts`; never
  `fetch` in a component (`client/CLAUDE.md:13-15`).
- Pages stay thin; feature logic lives in colocated `_components/<Name>/`
  folders (`client/CLAUDE.md:16-18`).
- New UI strings need a `messages/<locale>/*.json` entry, never an inline
  literal (`client/CLAUDE.md:18-20`). AC-48 reads as: add keys to the **existing
  reserved namespaces** (`ci.json`, `agentPerformance.json`, `shell.json`,
  `agents.json`), duplicate none.
- `src/vendor/ui` and `src/vendor/shared` are owned source, not dependencies
  (`client/CLAUDE.md:22-28`).
- **A new top-level route needs four wirings**, and the `NavItemDef` in
  `src/vendor/ui/nav.ts`'s `NAV` array is the one nothing errors on if you skip
  it — plus its `SHORTCUTS` entry and, if a new icon is needed, its
  `icons.tsx` registry entry (`client/LEARNINGS.md:362`, re-confirmed at the
  2026-08-19 addendum). Both of this feature's pages already have their
  i18n label and their `activeKeyFor` branch
  (`client/src/components/app-shell/helpers.ts:48-49`) — that is the
  "looks more done than it is" state the entry warns about.
- Importing a **runtime value** (not `import type`) from the
  `@devdigest/shared` barrel breaks `next build` with an error pointing at the
  barrel's own `export *` lines; import from the narrow
  `@devdigest/shared/contracts/<file>` path instead
  (`client/LEARNINGS.md:316`, twice-recurred). This feature imports runtime
  zod values (`CiRunStatus`, `CiFailOn`) — assume the trap.
- Typecheck + vitest are **not** evidence a new route boots
  (`client/LEARNINGS.md:316` process note) — P5 must run `next build`.
- `Markdown.tsx` constrains nothing about link/image targets; untrusted text
  must be neutralised before it reaches the primitive, not after
  (`client/LEARNINGS.md:244`). AC-54's CI-supplied strings (agent name, PR
  title, failure reason, generated file contents) are plain text — render them
  as text nodes / `<pre>`, never through `Markdown`.
- `activeKeyFor`'s `.includes()` rows are a substring-match bug class; new
  entries should use `hasSegment` (`client/LEARNINGS.md:486`). The two
  pre-existing `startsWith` rows for `/ci-runs` and `/agent-performance` are
  safe as they are — do not rewrite them.

## Approach

### P1 — Foundation: contracts, schema, adapter port, container

**Contracts** (this feature owns `eval-ci.ts` and `productionize.ts`'s
`AgentPerf*` block; it must not touch `contracts/observability.ts` — AC-50).
Apply every change to **both** `server/src/vendor/shared/contracts/` and
`client/src/vendor/shared/contracts/`, byte-identically (AC-49).

- `eval-ci.ts`:
  - `CiRun` (`:322-341` server copy) gains, all `nullish` and additive:
    `provider_run_id`, `repo`, `commit_sha`, `pr_title`, `pr_url`,
    `agent_name`, `critical`/`warning`/`suggestion`, `duration_source`
    (`'artifact' | 'provider'`), `failure_reason`; `status` narrows to
    `CiRunStatus`.
  - New `CiRunMeta` — the sidecar contract from D-P2:
    `{ commit_sha: string, repository: string, pr_number: number }`.
  - `CiExportInput.triggers` default → `['opened','synchronize']` (R-B).
  - New `CiSecretStatus` (`{ name, configured, provided_by_ci }[]`) for AC-64.
  - **`CiResultArtifact` is not modified** (D-P2).
  - Port the client copy's missing `AgentManifest` block verbatim from the
    server copy (server `:249-276`), including its `Provider`/`CiFailOn`
    imports from `./knowledge.js` (AC-49).
- `productionize.ts`: `AgentPerfRow` gains `runs_local` / `runs_ci` ints (so
  AC-45/AC-46 can be shown and explained); `AgentPerf.summary` gains
  `range_days`. Fix the two drifted enums the same pass, since both live in
  files this feature touches and AC-49 forbids increasing divergence:
  client `productionize.ts:36` (`PluginAgent.provider`) and client
  `eval-ci.ts:317` (`ConformanceInput.provider`) both need `'openrouter'`.
- `adapters.ts` (both copies) — `GitHubClient` gains three read methods next to
  the already-implemented `commitFiles`/`openPullRequest`/`findOpenPr`
  (`server/src/vendor/shared/adapters.ts:142-166`):
  - `listWorkflowRuns(repo, opts: { workflowPath: string; perPage?: number })`
    → `{ id, status, conclusion, head_sha, html_url, display_title, created_at,
    updated_at, run_started_at, pull_requests: number[] }[]`
  - `listRunArtifacts(repo, runId)` → `{ id, name, size_in_bytes, expired }[]`
  - `downloadArtifact(repo, artifactId)` → `Uint8Array` (the raw zip)
  - `listRepoSecretNames(repo)` → `string[]` — **names only**; the method's
    docstring must state that no value is ever requested (AC-64, AC-15).

**Schema** — `server/src/db/schema/ci.ts`, reshaped in place (D1; both tables
verified empty and unread):

- `ci_installations` gains `workspaceId` (not null, FK `workspaces`, cascade),
  `branch`, `base`, `workflowPath`, `postAs`, `triggers` (jsonb string[]),
  `prUrl`, `lastExportAt`; plus two unique indexes: `(workspace_id, agent_id,
  repo, target_type)` for AC-7 reuse and `(workspace_id, repo)` for AC-59's
  one-agent-per-repository rule.
- `ci_runs` gains `workspaceId` (not null, FK, cascade — D-P3),
  `providerRunId` (text, not null), `commitSha`, `prTitle`, `prUrl`,
  `agentName`, `critical`/`warning`/`suggestion` ints, `durationMs`,
  `durationSource`, `failureReason`, `agentRunId` (FK `agent_runs`, set null),
  `ingestedAt`. Unique index on `(workspace_id, provider_run_id)` — this is
  what makes AC-19 idempotent under two tabs refreshing at once, not
  application logic. Index `(workspace_id, ran_at desc)` for the list read.
- `source` keeps its reserved name and now means the CI system that produced
  the run (`'gha'`); document that on the column.
- Generate with `cd server && pnpm db:generate`. **`drizzle-kit generate` hangs
  under non-TTY stdin when it needs a rename-ambiguity answer**
  (`server/LEARNINGS.md:64`) — run it interactively, and if it asks about a
  rename, answer rather than piping.

**Container / wiring** — `platform/container.ts` gains `ciRepo`, `ciService`
and `memoryRepo` getters beside `evalRepo`/`evalService` (`container.ts:240-263`);
`modules/index.ts` gains one import + one `ci` entry. `AppConfig`
(`platform/config.ts`) gains `ciRunnerBundlePath`, default
`<serverRoot>/../agent-runner/dist/index.js`, overridable by
`CI_RUNNER_BUNDLE_PATH`.

**Adapters** — implement the four new methods in
`src/adapters/github/octokit.ts` (wrapped in the file's existing
`withRetry(withTimeout(...))` pattern, e.g. `:235-254`) and in
`MockGitHubClient` (`src/adapters/mocks.ts:218-240`), where they must be
scriptable from constructor opts the way `comments`/`login` already are — P3
and P4 verification depend on driving them.

### P2 — Generator (security-critical, pure)

New files, all pure functions with no DB, no HTTP, no container, no LLM
(AC-9/AC-25):

- `modules/ci/constants.ts` — bundle paths (`.github/workflows/devdigest.yml`,
  `.devdigest/agents/<slug>.yaml`, `.devdigest/skills/<slug>.md`,
  `.devdigest/runner/index.js`, `.devdigest/memory.jsonl`), the branch name
  (`devdigest/ci`), the pinned action SHAs from D-P6, and the secret name
  `OPENROUTER_API_KEY`.
- `modules/ci/manifest.ts` — agent row → `AgentManifest` → YAML. Serialise via
  the `yaml` package's dump (already a dependency of `agent-runner`; if it is
  not present in `server`, add it rather than hand-rolling quoting — hand-rolled
  YAML quoting of a hostile agent name is exactly AC-16's failure mode).
  Validate the object with `AgentManifest` **before** serialising, so the file
  the runner will re-validate cannot be born invalid (AC-12).
- `modules/ci/workflow.ts` — the workflow YAML. Non-negotiables, each
  individually verifiable:
  - `on: pull_request:` with `types:` from the selected triggers only; **never**
    `pull_request_target` (AC-60, D17, N14).
  - Job-level `if:` skipping fork-headed PRs
    (`github.event.pull_request.head.repo.fork == false`) — the runner does not
    guard this (`agent-runner/src/context.ts:30-32`), so the workflow is the
    only line of defence (AC-60).
  - `permissions:` explicit and minimal: `contents: read` always;
    `pull-requests: write` only when `post_as` is `pr_comment`; `pull-requests:
    write` (for the review) only when `post_as` is `github_review`; nothing at
    all beyond `contents: read` when `post_as` is `none` (AC-61).
  - Steps: checkout (pinned) → setup-node (pinned, `node-version: 22`) → run
    `node .devdigest/runner/index.js` → write the D-P2 sidecar → upload-artifact
    (pinned) with `if: always()` so a gate-triggered non-zero exit still
    publishes (AC-11b). No install step — the bundle is dependency-free
    (D14, `agent-runner/CLAUDE.md`).
  - The run step's `env:` supplies `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`,
    `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `GITHUB_REPOSITORY: ${{ github.repository }}`,
    `PR_NUMBER: ${{ github.event.pull_request.number }}`, `DEVDIGEST_POST_AS: <literal>`
    — matching exactly what `agent-runner/src/index.ts:31-40` reads (AC-11a).
  - **No user- or agent-authored text in any `run:` body, ever** (AC-16, D11).
    The only `run:` bodies in the file are two constants: the runner invocation
    and the sidecar writer. Everything variable arrives via `env:` or via file
    content.
  - No `uses:` referencing a DevDigest action; no tag or branch ref anywhere
    (AC-11, AC-62).
- `modules/ci/memory-export.ts` — `{kind, content}` records → JSONL. Kind and
  content only: never `embedding`, never `sources`, never `confidence` (D16,
  AC-58). Zero rows produces a valid empty file, never an omission and never a
  failure (AC-58a).
- `modules/ci/redact.ts` — one shared guard used in both directions:
  `containsSecretShapedValue(text)` (`sk-`, `ghp_`, `github_pat_`, `AKIA`, PEM
  header, long base64 assigned to a key/token/secret name — the same shapes
  `.claude/skills/pr-self-review/SKILL.md:149` lists) and
  `containsKnownSecretValue(text, values)` for values held by `SecretsProvider`.
  P2 uses it to assert generated contents are clean (AC-15/AC-55); P4 uses it
  on ingest (AC-63).
- `modules/ci/targets.ts` — the target registry (D13/AC-2a): a map from
  `CiTarget` to a generator. Exactly one entry (`gha`). A target with no entry
  is not rendered anywhere (AC-2/N1). The registry is what the Target step
  reads, so adding CircleCI later is one entry, no step edit.
- `modules/ci/bundle.ts` — assembles the five files, deterministically ordered,
  and reads the runner bundle from `config.ciRunnerBundlePath`. **If that file
  is missing, throw a stated precondition error** (`ValidationError`, not
  `ConfigError` — see constraints) naming the file and the build command
  (AC-52). Byte-identical output for an unchanged agent (AC-9).

**Build the runner bundle in this phase**: `pnpm --dir agent-runner build`,
then commit `agent-runner/dist/index.js`. This is a build artifact, explicitly
un-ignored by `.gitignore:3-6`; `agent-runner/src/**` is not touched (N5).

### P3 — Export / install service + routes

- `modules/ci/repository.ts` — installation CRUD and lookups, all
  workspace-scoped (AC-24). The only file in this module allowed to import
  `src/db/` (`db-only-in-repositories`).
- `modules/ci/ports.ts` — narrow local ports in the `modules/eval/ports.ts`
  style (`modules/eval/ports.ts:16-45`): `AgentLookup` (id → name, provider,
  model, system prompt, strategy, `ci_fail_on`), `SkillLookup`
  (`enabledSkills(agentId)` → `{slug, body}` — satisfied structurally by
  `container.agentsRepo`), `MemoryReader`
  (`listRepoScoped(workspaceId, repoId)` — satisfied by the D-P4
  `MemoryRepository`), `RepoLookup` (`owner/name` → imported repo id or null,
  satisfied by `container.repoRepo`). Never import the other module's class.
- `modules/ci/service.ts` — orchestration only:
  - `preview(workspaceId, agentId, input)` → `CiFile[]`, regenerated on every
    call so AC-4c's "changing the gate policy changes the preview" needs no
    client-side generation and no cache.
  - `export(workspaceId, agentId, input)`:
    - Resolve workspace first, always, before reading any installation row
      (AC-24).
    - AC-59: if an installation exists for this repo under a **different**
      agent, refuse with a stated reason and change nothing.
    - AC-7: reuse the existing `(agent, repo, target)` installation, its branch
      and its open PR — `commitFiles` already creates-or-fast-forwards and is
      documented idempotent (`vendor/shared/adapters.ts:155-160`,
      implementation `adapters/github/octokit.ts:254+`); `findOpenPr` decides
      reuse-vs-open. If the previous PR was closed or merged, open a new PR for
      the same branch rather than resurrecting it (spec §Edge cases).
    - AC-10/AC-10a: `action: 'files'` returns the archive **unconditionally**,
      never gated on write access; a missing credential or a write failure is
      reported with which of the two applies, writes **zero** installation rows,
      and still yields the bundle. Build the archive with `fflate`'s `zipSync`
      (already a server dependency, `package.json`).
    - AC-8: record agent, repo, target type, installed-at (+ the D-P3 columns).
  - `secretStatus(workspaceId, repo)` → `CiSecretStatus[]` from
    `listRepoSecretNames` — `OPENROUTER_API_KEY` reported configured-or-not by
    name; `GITHUB_TOKEN` reported as CI-provided with no lookup (AC-64, AC-6).
- `modules/ci/routes.ts` — zod-schema'd, `getContext` first on every route
  (`modules/_shared/context.ts`, pattern at `modules/eval/routes.ts:29-35`).
  Routes are declared with full paths (no prefix), as every module does:
  - `POST /agents/:id/ci/preview` → `CiFile[]`
  - `POST /agents/:id/export-ci` → `CiExport` (the route the reserved contract
    names, `eval-ci.ts:279`)
  - `POST /agents/:id/export-ci/archive` → zip download (AC-10)
  - `GET  /agents/:id/ci/installations` → CI tab list (AC-36)
  - `GET  /agents/:id/ci/secrets?repo=owner/name` → AC-64
  - `POST /ci/installations/:id/republish` → AC-37
  Fastify's static-over-param precedence keeps `/agents/performance` (P4) safe
  next to the agents module's existing `/agents/:id`
  (`modules/agents/routes.ts:97`).

### P4 — Ingest (security-critical) + read surfaces

- `modules/ci/ingest.ts` — the untrusted boundary. Order matters; each check is
  independent and its failure is recorded by name (AC-18):
  1. **Authenticated as a workspace member** — `getContext` resolved in the
     route before ingest is called; the installation is loaded workspace-scoped
     (AC-24).
  2. **Schema conformance** — `CiResultArtifact.safeParse` on
     `devdigest-result.json`; `CiRunMeta.safeParse` on `devdigest-run.json`.
  3. **Commit match** — `CiRunMeta.commit_sha` equals the provider run's
     `head_sha`.
  4. **Repository match** — `CiRunMeta.repository` equals the installation's
     stored `repo`.
  On any failure: record a `failed` `ci_runs` row carrying the failed check's
  name in `failure_reason`, and **store no field from the document** (AC-18).
  - Unzipping the artifact is reading an attacker-influenceable archive.
    Mirror the existing safe reader at
    `server/src/modules/skills/helpers.ts:218-268` exactly: `unzipSync` with a
    `filter` that inflates only the two known entry names, an entry-count cap,
    a per-entry `originalSize` cap, and an unsafe-path refusal (`..`, absolute,
    drive letter). Do not inflate the whole archive first.
  - AC-63: run `containsSecretShapedValue` over every string field of both
    parsed documents *before* persisting; on a hit, record `failed` with that
    reason and never persist, log or return the value (AC-55).
  - AC-21: a completed provider run with no artifact → a `failed` row with PR
    number, time and `github_url`, null counts, null cost. Never skipped.
  - AC-22: an artifact naming an unknown agent still ingests, attributed to the
    installation, with `agent_name` stored as recorded.
  - AC-23: no per-finding attribution is attempted; SPEC-13's contract is not
    read and not required (N7/N4). Say so in the file docstring.
  - AC-20/D7: one `ci_runs` row **and** one `agent_runs` row with
    `source: 'ci'` (the column at `db/schema/runs.ts:36` that nothing has ever
    written), `pr_id` null when the repo is not imported. Also write a
    `run_traces` row via the existing `platform/trace-builder.ts` `buildRunTrace`,
    whose `config.source` already accepts `'ci'` (`trace-builder.ts:19-26`) —
    that is what makes AC-30 work through the unchanged `GET /runs/:id/trace`
    (`modules/reviews/routes.ts:167`) with empty prompt-assembly, tool-calls,
    raw-output and log sections.
  - AC-19: upsert keyed on `(workspace_id, provider_run_id)`, backed by the P1
    unique index.
  - A run still in progress records as `running`, never `failed`; a gate-caused
    non-zero exit with a valid artifact is `succeeded` (or `no_findings` at zero
    findings), never `failed` (spec §Edge cases, `CiRunStatus`).
- `modules/ci/refresh.ts` — `listWorkflowRuns` per installation, filtered to
  the installation's `workflowPath`, with the D-P5 30s per-installation
  debounce and `force` bypass. A provider rate-limit or error degrades to
  "could not refresh, showing stored data" — it never empties the list and
  never fails the read (spec §Edge cases, AC-29).
- Read routes (all stored-rows-only; zero provider and zero LLM calls —
  AC-25): `GET /ci/runs` with date-range / agent / repository / status /
  source filters applied together (AC-28), `POST /ci/refresh`
  (`{ force?: boolean }`), and `GET /agents/performance`.
- Performance aggregation — `modules/ci/repository.ts` (or a sibling
  `performance.ts` reading through it): aggregate `agent_runs` over the range
  **without filtering on `source`** so `local` and `ci` both count for runs,
  cost, duration and findings (AC-45); compute accept rate **only** from
  `findings.accepted_at`/`dismissed_at` (`db/schema/reviews.ts:43-44`) joined
  through `reviews.run_id` (`reviews.ts:19`), and return `null` — not `0` —
  when an agent's runs in range are entirely CI-sourced (AC-46). `runs_local`
  and `runs_ci` per row make that state explainable in the UI. Range presets
  are 7/30/90 days, default 30 (D12/AC-43).

### P5 — Client

Order inside the phase: contracts parity check → hooks → CI Runs page → CI tab
→ export wizard → Agent Performance page → nav/shortcuts → `next build`.

- **Hooks** (`client/src/lib/hooks/ci.ts`, `agent-performance.ts`): react-query
  through `api` (`lib/api.ts:77+`), no direct `fetch`. The CI Runs list uses
  `refetchInterval: 30_000`; react-query's default
  `refetchIntervalInBackground: false` is what suspends polling while the page
  is hidden, so AC-29 needs no manual `visibilitychange` listener. The manual
  control calls the `POST /ci/refresh` mutation with `force: true` and
  invalidates the list. Precedents: `lib/hooks/core.ts:109`,
  `lib/hooks/eval.ts:127`.
- **`/ci-runs` page** — `app/ci-runs/page.tsx` (thin) +
  `app/ci-runs/_components/CiRunsView/`. Table per AC-27, with a placeholder
  (not `$0.00`, not `0`) for every value the ingest did not produce; filters per
  AC-28; empty state per AC-31 rendering **no table**; PR reference linking
  in-studio when the repo and PR are imported, else to the provider (AC-32);
  status announced to assistive tech via an `aria-live` region and carried by
  text + icon, never colour alone (AC-56/AC-57). Opening a trace mounts the
  promoted `RunTraceDrawer` (D-P7), which gains two optional props —
  `unavailableSections` and `providerUrl` — so the CI case states plainly which
  sections CI did not produce and links out (AC-30). Reuse
  `client/src/vendor/ui/` primitives; do not add new ones.
- **Agent editor CI tab** — add `{ key: "ci", labelKey: "editor.tabs.ci", icon:
  "Play" }` to `app/agents/[id]/_components/AgentEditor/constants.ts:13-17` and
  one branch in `AgentEditor.tsx:27-33`; the `?tab=` mechanism already carries
  it, and the other tabs are untouched (AC-33). New
  `_components/CiTab/` covering AC-34/35/36/38/39 — the three-way gate control
  maps Critical→`critical`, Warning+→`warning`, Never→`never` and persists via
  the existing agent update hook (D10/AC-35); `any` stays settable on the
  Config tab and is not offered here.
- **Export wizard** — `app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/`,
  using the reserved `ExportWizardSteps` primitive
  (`vendor/ui/ExportWizardSteps.tsx`) with the four labels from
  `ci.exportWizard.steps` in the fixed order Target → Preview → Configure →
  Install (D4/AC-1). Target renders one option per **registered** target
  returned by the server, so nothing about CircleCI/Jenkins/CLI exists in the
  DOM (AC-2/AC-2a). Preview renders paths + contents from
  `POST /agents/:id/ci/preview`, marking editable files, with the runner bundle
  collapsed (D-P8, AC-3). Configure owns triggers (opened + updated selected,
  reopened not — AC-4), post-as with review recommended (AC-4a), the
  gate-does-not-block-merges explanation as **visible text, not a tooltip**
  (AC-4b), the per-secret name + configured badge (AC-64), and re-requests the
  preview on every change (AC-4c). Install offers the PR and the archive as
  concurrent peers with the PR badged recommended (AC-10), names
  `OPENROUTER_API_KEY` and states `GITHUB_TOKEN` is automatic (AC-6), and
  surfaces the resulting PR URL (AC-5), the AC-10a reason, or the AC-59
  refusal.
- **`/agent-performance` page** — `app/agent-performance/page.tsx` +
  `_components/AgentPerformanceView/`. Summary tiles (AC-41), sortable agent
  table (AC-42), 7/30/90 presets defaulting to 30 (AC-43), the two cost
  breakdowns using `vendor/ui/charts/Donut.tsx` **each with a legend naming
  entry and cost** — that legend is also AC-56's non-graphical equivalent —
  (AC-44), the CI-runs-contribute-no-triaged-findings statement plus `N/A`
  (never `0%`) accept rate for CI-only agents (AC-46), and an empty state that
  renders no figures (AC-47).
- **Nav wiring** (AC-51) — two `NavItemDef` entries in
  `client/src/vendor/ui/nav.ts`'s `NAV` array plus two `SHORTCUTS` entries.
  Both icons are already in the registry, so `icons.tsx` needs no edit: CI Runs
  → `Play`, Agent Performance → `Gauge`. Suggested shortcuts `g i` and `g f`
  (free against today's `p x t s a c e ,`). **Delete or rename nothing** the
  sibling Multi-Agent Review feature contributes; `activeKeyFor` already
  returns both keys (`components/app-shell/helpers.ts:48-49`) and needs no
  change.
- **i18n** — extend the reserved namespaces in place: `messages/en/ci.json`,
  `messages/en/agentPerformance.json`, `messages/en/shell.json` (labels already
  present), `messages/en/agents.json` (`editor.tabs.ci`). Several ACs need keys
  that do not exist yet (AC-4b guidance, AC-59 refusal, AC-64 badges, AC-46
  N/A, AC-30 unavailable-section copy, AC-43 presets) — add them to the
  existing namespaces; duplicate no key that is already there (AC-48).

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md:129-141` (Phase 3 routing
table), capped at 4 per phase, respecting each skill's declared scope.

| Phase / files | Skills | Why |
|---|---|---|
| P1 `server/src/db/schema/ci.ts`, `db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Table row in the routing table; the reshape adds FKs, two unique indexes and a list index |
| P1 `server/src/vendor/shared/contracts/**`, `client/src/vendor/shared/contracts/**` | `zod` | Contract row; additive-nullish changes and `.default()` semantics decide whether existing parses still pass |
| P1 `server/src/adapters/**`, `platform/container.ts` | `onion-architecture`, `fastify-best-practices` | Ports defined by the inside, implemented by the outside; container is the composition root |
| P2 `server/src/modules/ci/{workflow,manifest,memory-export,redact,targets,bundle}.ts` | `security`, `onion-architecture`, `zod` | AC-15/16/60/61/62 are the phase; `security` is the `any .ts` row and here it is the point, not the backstop. `onion-architecture` keeps pure generators out of the repository/service rings |
| P3 `server/src/modules/ci/{service,routes,repository,ports}.ts` | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | Module row; schema-first routes, narrow local ports, AC-24 scoping |
| P4 `server/src/modules/ci/{ingest,refresh}.ts`, read routes, aggregation | `security`, `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns` | Untrusted-input boundary + zip handling + the aggregation queries behind AC-45/46 |
| P5 `client/src/app/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `security` | Client row; plus `security` for AC-54's render-as-text rule |
| P5 `client/src/components/run-trace-drawer/**`, `client/src/lib/hooks/**` | `frontend-ui-architecture`, `react-best-practices` | Components/lib row — the D-P7 promotion is a placement decision this skill governs |

Gaps in the routing table, filled by judgment and flagged as such:

- **`agent-runner/**`** has no row. This plan touches only its build output,
  never its source, so no skill is routed there. If a phase finds itself
  editing `agent-runner/src`, it has left this plan's scope (N5) — stop.
- **`client/messages/**`** has no row. Governed by `client/CLAUDE.md:18-20` and
  AC-48 directly, not by a skill.
- No test-authoring skill (`react-testing-library`) is routed anywhere, because
  no phase writes tests. That is deliberate, not an omission.

## Verification

Preconditions, once, before P1: Postgres up (`docker compose up -d` from the
repo root, or `./scripts/dev.sh --db-only`); `pnpm install` in `client/`
(**not yet run in this worktree** — `server/`, `reviewer-core/` and
`agent-runner/` are already installed).

`agent-runner` must stay green and untouched throughout — it is the AC-53
third package and the N5 canary:

```
pnpm --dir agent-runner run typecheck && pnpm --dir agent-runner test
```

### P1 gate

```
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm db:generate   # interactive; do not pipe stdin
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm db:migrate
pnpm --dir server typecheck
pnpm --dir server exec vitest run test/contracts.test.ts test/adapters.test.ts test/routes-smoke.test.ts
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm arch
pnpm --dir client exec tsc --noEmit
diff /Users/viktormashyka/Documents/GitHub/devdigest-ci/server/src/vendor/shared/contracts/eval-ci.ts \
     /Users/viktormashyka/Documents/GitHub/devdigest-ci/client/src/vendor/shared/contracts/eval-ci.ts
```

Passing looks like: migration applies against a live DB; all three server test
files green; `pnpm arch` reports no new violation (if it does, `pnpm
arch:baseline` then `git diff` the baseline file and confirm only the expected
edge appeared — `server/LEARNINGS.md:706`); the final `diff` is **empty** for
`eval-ci.ts` and for `adapters.ts`, and shows no `provider` enum divergence in
`productionize.ts` (AC-49).

### P2 gate

```
pnpm --dir agent-runner build                     # produces dist/index.js (AC-14/52)
pnpm --dir server typecheck
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm arch
```

Then generate one bundle and assert on the bytes. Write a throwaway script in
the session scratch directory (not in the repo) that imports `buildBundle` and
writes the five files to a scratch folder, for an agent whose name contains
`"; rm -rf / #`, a `$(id)` substitution and a newline, and run it with
`pnpm --dir server exec tsx <scratch>/gen-check.ts`. Assert, over the written
files:

- `grep -c pull_request_target workflow.yml` → **0** (AC-60)
- the job carries a fork guard on `github.event.pull_request.head.repo.fork`
  (AC-60)
- every `uses:` line matches `@[0-9a-f]{40}`, and **no** `uses:` line matches
  `@v[0-9]` or a branch name (AC-62)
- `grep -c "devdigest/review-action" workflow.yml` → **0** (AC-11, D14)
- a `permissions:` block exists; generated with `post_as: none` it grants no
  `pull-requests: write`, and with `github_review` it does (AC-61)
- the upload step carries `if: always()` (AC-11b)
- the run step's `env:` names all of `OPENROUTER_API_KEY`, `GITHUB_TOKEN`,
  `GITHUB_REPOSITORY`, `PR_NUMBER`, `DEVDIGEST_POST_AS` (AC-11a)
- the hostile agent name appears in `agents/<slug>.yaml` and **in no `run:`
  line** of the workflow; re-parsing the manifest with `AgentManifest` returns
  the name intact (AC-16, AC-12)
- the file set is exactly five paths including `.devdigest/memory.jsonl`, and
  with zero memory rows that file exists and parses as an empty record set
  (AC-3, AC-58, AC-58a)
- generating twice yields byte-identical output (AC-9)
- deleting `agent-runner/dist/index.js` makes generation fail with a stated
  precondition naming the build command, not a runtime crash (AC-52) — restore
  it afterwards

Paste the assertion results into the phase report; delete the script.

### P3 gate

```
pnpm --dir server typecheck
pnpm --dir server exec vitest run test/routes-smoke.test.ts test/adapters.test.ts
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm arch
```

Then drive the routes hermetically the way `test/routes-smoke.test.ts:22-30`
does — `buildApp({ config, overrides: { github: new MockGitHubClient(...) } })`
plus `app.inject` — from a scratch script, and report:

- one export → one `commitFiles` call, one `openPullRequest` call, a returned
  PR URL, one installation row (AC-5, AC-8)
- exporting twice for the same agent+repo → still one installation row, one PR
  URL, two commits (AC-7)
- exporting a *different* agent to the same repo → refused, first installation
  and its branch unchanged (AC-59)
- a mock whose `commitFiles` throws a permission error → stated reason, **zero**
  installation rows, archive still returned (AC-10a)
- a request naming another workspace's agent → refused before any installation
  row is read (AC-24)
- the whole export path with a stubbed LLM records **zero** provider calls
  (AC-9, AC-25)

### P4 gate

```
pnpm --dir server typecheck
pnpm --dir server exec vitest run test/routes-smoke.test.ts
pnpm --dir server exec vitest run test/integration.it.test.ts    # DB-backed; needs Docker
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm arch
```

Then, from a scratch script against a `MockGitHubClient` scripted with
workflow runs + artifact zips, report each of AC-18's four failure cases
(unauthenticated, non-integer findings count, mismatched commit, mismatched
repository) producing a `failed` row that names the failed check and stores no
counts; AC-63's credential-shaped value rejected and absent from every row and
log line; three refreshes over one provider run yielding exactly one `ci_runs`
row (AC-19); one ingest producing one `ci_runs` row plus one `agent_runs` row
with `source = 'ci'` and no change to any existing `local` row (AC-20); a
completed run with no artifact producing a `failed` row with null counts and a
usable link (AC-21); and `GET /ci/runs` making zero GitHub calls (AC-25).

### P5 gate

```
pnpm --dir client install          # first run in this worktree
pnpm --dir client typecheck
pnpm --dir client exec vitest run src/app/repos/\[repoId\]/pulls/\[number\]/_components/PrDetailView
pnpm --dir client test
pnpm --dir client build
```

`pnpm --dir client build` is not optional: typecheck and vitest do **not**
catch the `@devdigest/shared` barrel runtime-import failure that has now bitten
this repo twice (`client/LEARNINGS.md:316`), and this phase imports runtime zod
values. Passing looks like a clean production build plus every existing client
test green — the `PrDetailView` test is the one whose `vi.mock` path the D-P7
move edits, and that single-line edit is the only existing-test change this
plan authorises.

Manually confirm in `pnpm --dir client dev`: both sidebar entries appear, both
shortcuts navigate, and the sibling feature's entries in `nav.ts` are present
and unrenamed (AC-51).

### Final gate, after P5

The change spans a shared contract, a schema migration and both vendor copies,
so the scoped runs above are not sufficient on their own here:

```
pnpm --dir server typecheck && pnpm --dir server test
pnpm --dir client typecheck && pnpm --dir client test
pnpm --dir agent-runner run typecheck && pnpm --dir agent-runner test
cd /Users/viktormashyka/Documents/GitHub/devdigest-ci/server && pnpm arch
```

That is AC-53 verbatim, plus the architecture check. `git diff` must show **no**
change to `contracts/observability.ts` in either vendor copy (AC-50) and no
change under `agent-runner/src/` (N5).

## Risks

- **RISK-1 (accepted, product-owner decision) — the ingest boundary and the
  workflow generator ship with no automated tests.** SPEC-14's own AC-53 and
  N9 assume server integration tests against a stubbed GitHub client prove the
  ingestion path; the no-new-tests constraint replaces that with per-phase
  scripted evidence that is run once and thrown away. The security ACs most
  exposed to silent regression later are AC-16, AC-60, AC-61, AC-62 (generator)
  and AC-18, AC-63 (ingest). **Recommendation: run `test-writer` as a separate
  follow-up workflow scoped to `server/src/modules/ci/` before this branch
  merges to `main`.** Flagged rather than quietly assigned, per the brief.
- **RISK-2 — `pr-self-review` will fire "New exported function/component with
  no `*.test.ts(x)` in the same diff" (HIGH) across most of this diff**
  (`.claude/skills/pr-self-review/SKILL.md:155`). Pre-authorised deviation;
  cite this plan and RISK-1 rather than reopening the decision at push time.
- **RISK-3 — sibling-merge conflict points.** Three files:
  `client/src/vendor/ui/nav.ts` (both features add `NAV` + `SHORTCUTS`
  entries), `server/src/modules/memory/repository.ts` (method-level union by
  construction, D-P4), and `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/`
  (one import line, D-P7). `feat/multi-agent-review` merges first; re-verify
  AC-51 navigation after that merge, as the spec requires.
- **RISK-4 — P5 is the largest phase** (four surfaces, nav, i18n, a component
  move). If it overruns, the natural cut line is Agent Performance, which
  depends on nothing else in P5 and could be a sixth phase — but that exceeds
  the 5-agent cap, so it would have to be an override, not an improvisation.
- **RISK-5 — the D-P2 sidecar is this plan's invention, not the spec's.** It
  is the only way to make AC-18's commit and repository checks non-vacuous
  without modifying `CiResultArtifact` (compiled into the runner) or
  `agent-runner/src` (N5). If a reviewer prefers extending the artifact
  contract instead, that is a spec-level decision with a runner-rebuild
  consequence, and it should be taken before P2 starts, not during it.
