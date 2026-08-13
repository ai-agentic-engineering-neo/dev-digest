# Onboarding Generator — Implementation Plan

## Source requirements

[`specs/10-onboarding-generator.md`](../specs/10-onboarding-generator.md)
(SPEC-10, status **approved**, no open `[NEEDS CLARIFICATION]`) — feature 2 of
the "Project Context" epic (L05), after `plans/09-project-context-folder.md`.
This plan covers **every** acceptance criterion in that spec:

| Area | AC-IDs |
|---|---|
| Deterministic fact collection | AC-1, AC-2, AC-3, AC-4, AC-5, AC-18 |
| Ranking & the computed reading order (real `hotness`, weighted score) | AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12 |
| The one structured call | AC-13, AC-14, AC-15, AC-16, AC-17 |
| Generation, caching & freshness | AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26 |
| Grounding | AC-27, AC-28, AC-29, AC-30, AC-31, AC-32 |
| Degraded, failed & empty states | AC-33, AC-34, AC-35, AC-36, AC-37, AC-38 |
| Client surface | AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46 |
| Cross-module access (MCP) | AC-47, AC-48, AC-49 |

Decisions D1–D12 and non-goals N1–N11 are settled; nothing below reopens them.
In particular: the shared persisted `file_rank.rank` keeps its structural
definition (D7/AC-11), generation is never implicit (D3/N7/AC-19), nothing is
written to a checkout (N4), `reviewer-core` is untouched (D9), and the tour's
client route contains no `onboarding` segment (D10/AC-39).

## Clarifications & recommendations

D12 delegated the numeric budgets to this plan (Q1 below). Everything else here
is a **planner recommendation** — marked as such — made so the implementer is
never blocked; each is cheap to overturn.

### Q1 — token budget and size caps for the fact payload (delegated by D12; DECIDED)

New constants in `server/src/modules/onboarding/constants.ts`:

| Constant | Value | Why |
|---|---|---|
| `ONBOARDING_FACTS_TOKEN_BUDGET` | `6000` tokens | Absolute, not a share of a model window — there is still no per-model context-window table in this codebase (`platform/price-book.ts` carries prices only; the same finding as `plans/09-project-context-folder.md` Q3). Scale anchors: the repo-map prompt slot is `1500` (`server/src/modules/repo-intel/constants.ts:51`), project-context documents get `8000` (`server/src/modules/project-context/constants.ts`), and `conventions` sends 12 whole source files with **no** budget at all (`SOURCE_SAMPLE_COUNT = 12`, `server/src/modules/conventions/constants.ts:18`). 6000 tokens ≈ 24 KB of structured fact lines — comfortably fits 40 ranked files + 40 routes + a 40-line directory skeleton + 20 scripts, and stays cheap on the `onboarding` feature's documented default model (`openrouter` / `deepseek/deepseek-v4-flash`, `vendor/shared/contracts/platform.ts:43-50`). Counted with the same `container.tokenizer` port project-context counts with (`platform/container.ts:39`, `:93`) — never a second estimator. |
| `ONBOARDING_MAX_OUTPUT_TOKENS` | `4000` | Passed as `maxTokens` on the one `StructuredRequest` (`vendor/shared/adapters.ts:55-62`). Five sections + ≤10+10 one-sentence reasons + one Mermaid diagram. |
| `READING_PATH_MAX` / `CRITICAL_PATHS_MAX` / `SETUP_STEPS_MAX` | `10` / `10` / `10` | AC-25 verbatim. |
| `FIRST_TASKS_MIN` / `FIRST_TASKS_MAX` | `3` / `5` | AC-25 verbatim. |
| `FACT_RANKED_FILES` | `40` | The candidate pool named in the payload — 4× the 10 that get shown, so the model has context for the architecture narrative and first tasks without re-ranking anything. Cf. `SOURCE_SAMPLE_COUNT = 12`. |
| `FACT_DIR_ENTRIES` / `FACT_DIR_DEPTH` | `40` / `2` | Directory skeleton, derived from the indexed path set (AC-3 — never a fresh walk). |
| `FACT_ROUTES_MAX` / `FACT_CRONS_MAX` | `40` / `10` | From `file_facts` for the ranked pool only. |
| `FACT_SCRIPTS_MAX` / `MAX_SCRIPT_CHARS` | `20` / `200` | Script strings are untrusted repo content; 200 chars mirrors `MAX_SIGNATURE_CHARS = 120` (`repo-intel/constants.ts:53`) in spirit — long enough to be a real command, short enough that a hostile script body can't dominate the payload. |
| `MAX_MANIFEST_BYTES` | `256 * 1024` | Per-file ceiling on every checkout read, same value as project-context's `MAX_DOC_BYTES`. |
| `CHECKOUT_READ_FILES` | fixed 8-name list | `package.json`, `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`, `.env.example`, `.env.sample`, `Makefile`. A **fixed filename list at the repo root, resolved one by one** — no walk, no glob, so AC-1/AC-3's "never a fresh unbounded filesystem walk" holds by construction. |
| lockfiles | **detected by filename, never read** | Package manager is inferred from which of `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lockb` exists (a `stat`, not a read). Lockfiles are megabytes and carry no fact this feature needs. This is why no lockfile size cap is required. |

**Drop-don't-truncate rule** (D12): the payload is rendered section by section
and token-counted; while it exceeds `ONBOARDING_FACTS_TOKEN_BUDGET`, whole
entries are dropped in this fixed order — crons → routes → directory entries
beyond 20 → ranked files beyond 20 → scripts beyond 10. **Never dropped:**
coverage facts (AC-18), detected stack, the ≤10 reading-path entries, the ≤10
critical-path chains, the ≤10 setup candidates. Nothing is ever truncated
mid-entry, and every drop is recorded in the generation log line.

### Q2 — does a `partial` index get a tour, or only the skeleton? (RECOMMENDATION — read this one)

A literal reading of AC-33 ("degraded, **partial**, absent, or still being
built → skeleton") would make this feature unusable on almost every real repo:
`full.ts:250-252` downgrades a `full` index to `partial` if **one** file fails
to parse or the soft budget is hit, and `repo-intel/repository.ts:216-218`
explicitly documents that "`'partial'` is still a working index — no degraded
flag". Repo-map and blast-radius already serve from partial indexes.

**Recommendation:** the skeleton-only / refuse-to-generate condition is
`status ∈ {degraded, failed}` **or** no clone **or** zero ranked files — not
`partial`. A `partial` index generates a tour, and the provenance line states
the status as `partial` with its `reason` (AC-30 already demands exactly that).
One constant (`GENERATABLE_STATUSES`) holds the rule, so flipping to the
literal reading is a one-line change if the product owner prefers it.
AC-33's own verify sentence ("for each degraded reason the index layer can
report") points the same way: `DegradedReason` is only ever populated for
`degraded`/`failed` (`repo-intel/repository.ts:219-232`).

### Q3 — the LLM response schema shape (DECIDED — see Approach §3)

A **separate raw-response schema** (`onboarding/schemas.ts`), not the shared
`Onboarding` contract, mapped into `Onboarding` after grounding. Rationale in
Approach §3; this mirrors `conventions/schemas.ts:1-9`'s stated principle ("the
LLM-facing extraction schema — narrower than the DB-shaped DTO").

### Q4 — a grounded first-tasks section that falls below 3 entries (RECOMMENDATION)

Grounding (AC-31: every first task must reference an indexed file) can drop a
task, taking the section under AC-25's floor of 3. **Keep the survivors** (0–5)
and render the section labelled model-suggested; do **not** re-prompt (D11
forbids a second generation) and do **not** fabricate. G7 (drop what isn't
grounded) outranks hitting a count. The same rule applies to a reading-path
entry whose reason the model omitted: the entry is a deterministic fact, so it
is kept and rendered without a reason rather than dropped.

### Q5 — is an e2e flow expected? (RECOMMENDATION)

**No** — N9 says so, and the hermetic stack has no provider key. `e2e` is not
in this plan's module list. If one is wanted later it must hit the skeleton
path only.

### Additional planner findings (not in the spec — read before coding)

1. **The `onboarding` table already exists and has never been written to.**
   `server/src/db/schema/context.ts:123-129` — `repo_id` PK, `json` jsonb,
   `generated_at`. Repo-wide grep finds it only in `db/schema.ts:40,80` (the
   barrel): zero readers, zero writers, zero routes. This is exactly the
   pattern `server/LEARNINGS.md:38-54` records for the `conventions` table —
   **redesigning it in place is free**, no back-compat shim, no data
   migration. Re-confirm with a fresh grep plus `select count(*) from
   onboarding;` on your dev DB before adding `NOT NULL` columns.
2. **`stats.hotnessAvailable: false` is a second reserved integration point**
   — written by both pipelines (`repo-intel/pipeline/full.ts:262`,
   `pipeline/incremental.ts:251`), read by nobody. Per
   `server/LEARNINGS.md:569-580`, that flag *is* the integration contract for
   this change; flip it to `prsConsidered > 0` rather than inventing a new
   signal.
3. **`stats.bounded` survives a full index but is lost on the first
   incremental refresh.** `full.ts:254-255` spreads `...walk.stats` into the
   persisted stats; `incremental.ts:244-255` builds a fresh stats object that
   does **not**, even though it already ran a full `walkClone` at `:218`. So
   D1/AC-18's "count excluded by the index bound" would silently become
   `undefined` after any refresh. Fix: spread the walk's `bounded` (and
   `totalCandidates`) into incremental's stats object. Small, but AC-18 is
   unsatisfiable without it.
4. **`blast/service.ts → repo-intel/types.ts` is a *baselined* violation, not
   a pattern to copy** (`.dependency-cruiser-known-violations.json`, the
   `no-cross-module` entry). Onboarding must not import from
   `modules/repo-intel/**` at all — see the D7 decision in Approach §1.
5. **Path containment must be shared, not re-copied.** `project-context/paths.ts`
   is the only containment-proving checkout reader in the tree
   (`server/LEARNINGS.md:316`), and onboarding needs exactly it. Importing it
   across modules is a `no-cross-module` violation; copying it duplicates a
   security control. **Move it to `server/src/modules/_shared/checkout-paths.ts`**
   (`_shared` is explicitly exempt in `.dependency-cruiser.cjs`'s
   `no-cross-module` rule) and update its importers — currently
   `project-context/discovery.ts:5` and `server/test/project-context-paths.test.ts:18`;
   re-grep before moving.
6. **`client/messages/en/onboarding.json` exists and is referenced by
   nothing.** Its `generate.body` names the *wrong five sections* ("overview,
   architecture, key modules, getting started, and conventions & gotchas") —
   D4 says that copy is a stale placeholder. It must be **rewritten**, not
   extended. The nav label `nav.onboarding-tour` in
   `client/messages/en/shell.json:19` is already correct and stays.
7. **`FeatureModelId: 'onboarding'` is fully wired already** —
   `vendor/shared/contracts/platform.ts:14-21` plus a `FEATURE_MODELS` entry
   with `defaultProvider: 'openrouter'`, `defaultModel:
   'deepseek/deepseek-v4-flash'` (`:43-50`). AC-15 needs no Settings work:
   `container.resolveFeatureModel(workspaceId, 'onboarding')`
   (`platform/container.ts:189-191`) is the whole implementation.
8. **`client/src/lib/github-urls.ts:20-36`'s `githubBlobUrl(fullName, sha,
   file)` is AC-44** — it already percent-encodes each path segment, which is
   what the spec's "path with unusual characters" edge case needs. No new URL
   helper.

## Execution mode

**Recommendation: multi-agent, in three implementation phases.**

Reasoning about scope width: this touches **three packages plus a shared
contract in two drifted copies**, changes the indexer's persisted output
(`hotness` becomes non-zero on every repo), adds one migration, adds a new
server module, a new client route, and a sixth MCP tool. It also carries the
single highest-risk constraint in the epic (D7/AC-11: three shipped features
must keep byte-identical ordering). One `implementer` run would have to hold
the ranking pipeline, the grounding logic, the React page and the MCP tool in
one context — and the Phase A work is what Phase B and C consume.

Proposed order:

1. `/implement-plan` **Phase A — ranking + contracts**: `repo-intel` hotness
   (repository read, `computeFileRank`, both pipelines, the stale comments),
   the additive `RepoIntel` facade methods, the `IndexState` widening, the
   `onboarding` table migration, and both `vendor/shared` contract copies.
   (That skill runs `implementer` → `plan-verifier` gate →
   `architecture-reviewer` fix loop.)
2. `/implement-plan` **Phase B — the onboarding module**: fact assembly, the
   one structured call, grounding, rendering, service + routes + container
   getter, `_shared/checkout-paths.ts` move.
3. `/implement-plan` **Phase C — client + mcp-server**: the `/repos/[repoId]/tour`
   page, nav + `activeKeyFor` fix, hooks, i18n rewrite, and the
   `get_onboarding_tour` MCP tool.
4. `test-writer` once, after C, for any row of the **Verification** test matrix
   the three passes did not produce.
5. `/pr-self-review` immediately before push (it re-runs the full suites anyway).

Phase A must land first — Phase B reads the new facade methods and the widened
`IndexState`; Phase C consumes the new contracts. A single-agent pass is
*possible* but is not advised at this width; the AC-11 regression surface alone
justifies an independent `architecture-reviewer` pass over Phase A.

**User's confirmed choice: pending.** The planner had no interactive channel in
this run; treat the above as the recommendation, not a settled decision.

## Modules affected

| Module | Why |
|---|---|
| **server** | The whole feature's substance: real `hotness` in the repo-intel pipeline, three additive `RepoIntel` facade reads, a widened `IndexState`, a new `onboarding` module (facts, one structured call, grounding, render, service, routes), the `onboarding` table redesign + migration, a container getter, and the `_shared/checkout-paths.ts` move. |
| **client** | New `/repos/[repoId]/tour` page and its `_components/OnboardingTourView/` tree, the `activeKeyFor` fix + `NAV`/`SHORTCUTS` entries (D10/AC-39), a new hooks file, and the `messages/en/onboarding.json` rewrite. |
| **mcp-server** | AC-47/AC-48: a sixth, read-only tool `get_onboarding_tour`, appended to the fixed registration order, plus its README row. No CLI change. |
| **reviewer-core** | **Not affected** — D9. Nothing in this feature enters the review path, and `groundFindings`/`INJECTION_GUARD` are not touched. |
| **e2e** | **Not affected** — N9 / Q5 above. |

## Architectural constraints

Cited, not paraphrased. Read the linked lines before writing the corresponding
code.

### Root

- `CLAUDE.md` "Do-not-touch / edit-with-care" — `server/src/vendor/shared` and
  `client/src/vendor/shared` are **independent, already-drifted copies**. Every
  contract change below must be applied to **both** by hand; `pr-self-review`
  Phase 4 rates a one-sided change HIGH.
- `CLAUDE.md` "Conventions (non-default)" — migrations are **not** applied on
  boot: `cd server && pnpm db:migrate` after generating.
- `CLAUDE.md` "Gotchas" — `docker compose down -v` wipes every imported repo;
  hotness needs ingested PR history, so don't destroy your dev data mid-task.

### server

- `server/CLAUDE.md:12-14` — routes are schema-first: zod `params`/`body` via
  `fastify-type-provider-zod`; handlers never hand-roll `Schema.parse`.
- `server/CLAUDE.md:15-16` — a new module must be added to
  `src/modules/index.ts` (one import + one entry) or it is dead code.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks.
- `server/CLAUDE.md:31-32` — never hand-edit an applied migration.
- `server/CLAUDE.md:41-43` — prompt-injection defense is the one shared
  `INJECTION_GUARD`; **do not** add per-field keyword scanning or denylists to
  the fact payload (the spec's Non-functional "Security" section says the same).
- `server/CLAUDE.md:47-50` — `*.it.test.ts` = DB-backed (testcontainers,
  self-skipping); everything else hermetic.
- `.dependency-cruiser.cjs` — `no-cross-module` (error) forbids
  `modules/onboarding/**` importing `modules/repo-intel/**`, **including
  `import type`** (`tsPreCompilationDeps: true`); `_shared` is the only exempt
  folder. `no-container-in-services` (error) forbids `service.ts` importing
  `platform/container.ts`. `db-only-in-repositories` (error) confines
  `src/db/**` imports to `repository.ts`.
- `server/LEARNINGS.md:161` — a new module needing another module's
  repo/service declares a **narrow local port** and is composed at `routes.ts`;
  the 2026-08-11 addendum: for a brand-new file needing a few fields, a fully
  local interface beats a `db/rows.ts` alias and beats a new baseline entry.
- `server/LEARNINGS.md:38-54` — grep for the likely table/contract name before
  assuming new schema is needed, and confirm "never written to" before
  redesigning in place. (Done — planner finding 1.)
- `server/LEARNINGS.md:569-580` + `:582-600` — a reserved-but-unwired column or
  flag usually *is* the integration contract; but confirm which lesson reserved
  it. (`file_rank.hotness`, `stats.hotnessAvailable` and the `onboarding` table
  are all reserved for **this** spec, which names each of them explicitly.)
- `server/LEARNINGS.md:64-82` — `drizzle-kit generate` hangs on a non-TTY when
  a pass both drops and adds. This pass only **adds** columns; still run
  `pnpm db:generate < /dev/null`.
- `server/LEARNINGS.md:396-410` — `.nullable()` on a shared contract makes the
  key **required** and breaks every fixture that builds the type. Directly
  relevant to the `IndexState` widening: use optional (`?:`) fields, not
  `.nullable()`.
- `server/LEARNINGS.md:619-634` — `.dependency-cruiser-known-violations.json`
  baselines exact from→to **edges**. If `pnpm arch` fails, run
  `pnpm arch:baseline` and `git diff` it; **this plan expects zero new
  entries** — a new one means the local-port rule was broken.
- `server/LEARNINGS.md:635-670` — tests build partial `as unknown as Container`
  mocks; a new `container.<x>` read in shared code must tolerate a mock that
  lacks it.
- `server/LEARNINGS.md:316-333` — proving containment against a symlink escape
  needs `realpath` on **both** sides and must distinguish "escapes" from
  "doesn't exist". This is the helper being moved to `_shared`, unchanged.
- `server/LEARNINGS.md:445-468` — evidence verification, not model honesty, is
  what makes "every claim cites something real" true. Grounding here is the
  same stance applied to paths and commands.
- `server/src/modules/repo-intel/types.ts:1-23` — the facade is "the SINGLE
  interface every feature codes against", and its **degraded contract** is
  fixed: object-returning methods carry inline `degraded?`/`reason`,
  array-returning methods return `[]`. New methods must obey both.
- `server/src/modules/conventions/service.ts:97-137` — the precedent for a
  server-module feature making its own one structured call with locally
  declared ports (`RepoLookup`, `FeatureModelResolver`, `LlmResolver`),
  composed in `routes.ts:33-40`.
- `server/src/platform/container.ts:155-160` (`projectContextService`) — the
  shape a new lazy `onboardingService` getter copies.

### client

- `client/CLAUDE.md:13-15` — all data access goes through `src/lib/hooks/*` →
  `src/lib/api.ts`; never `fetch` in a component.
- `client/CLAUDE.md:16-17` — pages stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `client/CLAUDE.md:18-19` — new UI strings need a `messages/en/*.json` entry.
- `client/CLAUDE.md:22-28` — `src/vendor/shared` and `src/vendor/ui` are owned,
  drifted copies.
- `client/LEARNINGS.md:322-347` — a new route needs **four** wirings; the `NAV`
  array is the one nothing errors on if skipped.
- `client/LEARNINGS.md:348-360` — repo-scoped routes follow the
  `repos/[repoId]/…` pattern (`useParams` + `useActiveRepo` +
  `useRepoNotFound` gate). `client/LEARNINGS.md:133-158` — do **not** copy
  `pulls/page.tsx` as a route template; copy `context/page.tsx` instead
  (`client/src/app/repos/[repoId]/context/page.tsx`, 7 lines).
- `client/LEARNINGS.md:361-383` — a mutation hook writing `setQueryData` in
  `onSuccess` needs `qc.cancelQueries` in `onMutate`.
- `client/LEARNINGS.md:276-321` — importing a **runtime value** from the bare
  `@devdigest/shared` barrel breaks the webpack build with a misleading error;
  import from `@devdigest/shared/contracts/<module>`. Also: passing
  `typecheck` + `vitest` is **not** evidence a new route boots.
- `client/LEARNINGS.md:259-275` — compute the `../` depth to
  `messages/en/*.json` in a test file; don't count by eye.
- `client/LEARNINGS.md:428-444` — a design mockup overrides spec prose on
  placement questions.
- `client/src/components/mermaid-diagram/MermaidDiagram.tsx:8-14`, `:36-53` —
  `securityLevel: "strict"`, keyword pre-check, `mermaid.parse` before render,
  and **renders nothing** on invalid input. That component *is* AC-42; do not
  add a second diagram path.
- `client/src/vendor/ui/primitives/Markdown.tsx:1-40` — `react-markdown` +
  `remark-gfm`, **no `rehype-raw`**, so raw HTML is not markup. That is AC-41;
  do not add an HTML-enabling plugin.

### mcp-server

- `mcp-server/CLAUDE.md:14-19` — **no `@devdigest/shared` alias**; every
  contract is redefined locally as a minimal subset interface, next to where
  it's consumed (`src/tools/get-blast-radius.ts:18-52` is the model).
- `mcp-server/CLAUDE.md:20-23` — `src/http/client.ts` is the only module
  allowed to call `fetch()`.
- `mcp-server/CLAUDE.md:24-30` — tool descriptions and **registration order**
  must stay byte-identical across calls. Appending a sixth tool at the end of
  `registerTools` (`src/tools/index.ts:29-57`) is a deliberate, reviewed edit;
  **do not reorder or reword the existing five.**
- `mcp-server/CLAUDE.md:31-34` — handlers never throw; they return
  `{ isError: true, content: [{ type: 'text', text: … }] }`.

## Approach

### 1. repo-intel — real `hotness`, and the D7 read-time weighted score

**The D7 decision (facade vs. local port) — decided.** Onboarding gets its
ranking through **additive methods on the `RepoIntel` facade**, consumed via a
**narrow local port interface declared inside the onboarding module** and wired
from `container.repoIntel` at `onboarding/routes.ts`.

Why not an onboarding-local repository reading `file_rank` directly: the tour
needs ranks *and* graph chains *and* per-file facts *and* index state — four
reads that already exist behind the facade `types.ts:1-7` calls "the SINGLE
interface every feature codes against", and that the spec's own Inputs table
sources from `repoIntel.*`. A second read model over `file_rank`/`file_edges`
would drift the moment the indexer changes. Why not import `RepoIntel` from
`repo-intel/types.ts`: that edge is a **baselined `no-cross-module`
violation** (planner finding 4), not a pattern. Declaring the port locally and
letting `RepoIntelService` satisfy it structurally is precisely
`server/LEARNINGS.md:161`'s rule and adds **zero** new baseline entries — the
same trick `conventions/service.ts:20-25` and `blast/routes.ts:20-21` use.

**1a. Hotness at index time (AC-7, AC-8, AC-9, AC-10).**

- New read in `repo-intel/repository.ts` (this file may import `src/db` —
  `db-only-in-repositories`): `getPrChurn(repoId, since: Date)` joins
  `pr_files` → `pull_requests` on `pr_id`
  (`server/src/db/schema/pulls.ts:45-54`, `:5-43`), filters
  `pull_requests.repo_id = repoId AND opened_at >= since`, and returns
  `{ counts: Array<{ path: string; prs: number }>, prsConsidered: number }`
  where `prs` is `count(distinct pr_id)` per path. Rows with a NULL `opened_at`
  (the column is nullable, `pulls.ts:27`) cannot be windowed and are excluded —
  document that in the method's doc comment.
- `pipeline/rank.ts` — `computeFileRank(files, edges, churn?)` gains an
  **optional third parameter**, `ReadonlyMap<string, number>` of *raw* PR
  counts. Inside (still pure, still no DB/git/clock): intersect with `files`
  (AC-10 — a PR path that isn't indexed is ignored, never added as a node),
  take `max` over the intersection, set `hotness = count / max` (0 when the map
  is absent or `max === 0`, AC-9). **`rank` stays `= pagerank`** and
  `percentile` is still derived from `rank` — that is AC-11's entire mechanism.
- `pipeline/full.ts` (before `computeFileRank`) and `pipeline/incremental.ts:224`
  fetch the churn map with
  `new Date(Date.now() - HOTNESS_WINDOW_DAYS * 86_400_000)`
  (`repo-intel/constants.ts:50`, currently unused) and pass it in. The clock
  stays in the caller so `rank.ts`'s stated purity contract holds.
- Both pipelines' stats objects gain `hotnessPrs: prsConsidered`,
  `hotnessWindowDays: HOTNESS_WINDOW_DAYS`, and flip the reserved
  `hotnessAvailable` (`full.ts:262`, `incremental.ts:251`) to
  `prsConsidered > 0` (planner finding 2). `incremental.ts`'s stats object also
  gains `bounded`/`totalCandidates` from the `walkClone` it already runs at
  `:218` (planner finding 3).
- **Correct the now-false comments** (spec-flagged trap):
  `server/src/db/schema/repo-intel.ts:90-98` and `:113-114` ("always 0 under
  Option B"), and `pipeline/rank.ts:1-14`. Both must say: `hotness` is real and
  persisted; `rank` deliberately stays `= pagerank` because three shipped
  features read it (D7); the weighted product is derived at read time by the
  onboarding module only. `pipeline/repo-map.ts:10` and
  `pipeline/incremental.ts:14` carry the same stale claim — fix those lines too.

**1b. Additive facade reads (AC-6, AC-11, AC-12).**

`getFileRank`, `getTopFilesByRank` (`service.ts:703-720`) and
`getConventionSamples` (`:694-696`) are **not modified** — their bodies, their
`ORDER BY rank DESC` source (`repository.ts:449-459`) and their return values
stay byte-identical, which is AC-11's verification. `getTopFilesByRank` stays
available for whoever wants the unweighted structural order. Three additions to
`RepoIntel` (`repo-intel/types.ts`) and `RepoIntelService`:

| New method | Shape | Notes |
|---|---|---|
| `getWeightedRankedFiles(repoId, n, opts?: { exclude?: string[] })` | `Promise<WeightedFileRow[]>`, `{ path, pagerank, hotness, weighted, percentile }` desc by `weighted` | Backed by a new `repository.getFileRankRows(repoId, limit)` selecting `path, pagerank, hotness, percentile` for **all** rows (≤ `MAX_INDEXED_FILES` = 5000), sorted in JS by `pagerank * (1 + hotness)`. Fetching all rows is what AC-12 requires: taking a `rank DESC LIMIT 100` prefix and reweighting it would mix weighted and unweighted selection and miss a high-churn, low-pagerank file. Reuses the existing `isJunkPath` filter (`service.ts:794-797`) so a lockfile can't open the reading path (the spec's "single file dominating PR history" edge case). Returns `[]` when the flag is off or nothing is ranked (the array-degraded contract, `types.ts:15-22`). |
| `getCriticalPaths(repoId, opts?: { order?: 'rank' \| 'weighted' })` | unchanged return `Promise<string[][]>` | **Optional param, default `'rank'` = today's behavior**, exactly what D7 permits. Refactor the existing body (`service.ts:727-766`) to extract a private `chainsFrom(edges, rankOf, roots)` helper and call it with either the existing `rankOf` map or the weighted one — the BFS/adjacency logic is borrowed, not duplicated, and the default output is provably unchanged. |
| `getFileFacts(repoId, paths)` | `Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>>` | Thin passthrough to the already-existing `repository.getFileFacts` (`repo-intel/repository.ts:553-566`). Needed for AC-35's "detected routes" in the skeleton; bounded by the ranked pool. |

**1c. Index coverage becomes observable (D1, AC-18, AC-30).**

`IndexState` (`repo-intel/types.ts:42-50`) gains three **optional** fields —
`filesExcludedByBound?: number`, `hotnessPrs?: number`,
`hotnessWindowDays?: number`. Optional, not `.nullable()`, so no existing
fixture stops compiling (`server/LEARNINGS.md:396-410`). They are projected out
of the `stats` jsonb in `tryGetIndexState` (`repo-intel/repository.ts:212-232`)
exactly the way `durationMs` and `reason` already are — one line each, no
migration, no pipeline signature change. `IndexResult` is **not** widened (the
indexer's return value has no reader that needs this). The facade's synthesized
degraded fallback simply omits them.

### 2. server — the new `onboarding` module

New folder `server/src/modules/onboarding/`, registered in
`src/modules/index.ts` (one import + one entry, `server/CLAUDE.md:15-16`):

| File | Contents |
|---|---|
| `constants.ts` | Every number from Q1, `SECTION_KINDS` (the AC-16 order), `GENERATABLE_STATUSES` (Q2), `CHECKOUT_READ_FILES`, `LOCKFILE_NAMES`. |
| `ports.ts` | The narrow local interfaces — `RepoIntelPort` (the three new reads + `getIndexState`), `RepoLookup` (copy the shape at `conventions/service.ts:20-25`), `FeatureModelResolver`, `LlmResolver`, `Tokenizer`. **No import from any other module.** |
| `stack.ts` | AC-2: read `package.json` (containment-checked, ≤ `MAX_MANIFEST_BYTES`), derive language/runtime (`engines`, `type`, presence of `tsconfig.json`), package manager (`packageManager` field, else lockfile **filename** via `stat`), frameworks (dependency-name match against a small fixed table: next, react, fastify, express, nest, vite, drizzle-orm, prisma…). Every value carries `{ value, evidenceFile }`. |
| `setup.ts` | AC-4: candidate steps from `package.json` `scripts` (≤ `FACT_SCRIPTS_MAX`, each string trimmed to `MAX_SCRIPT_CHARS`), presence of an env-example file, and a compose file's declared **service names only** (a `services:` top-level key scan — no YAML dependency, no value interpolation). Each candidate carries `{ command, kind, evidenceFile }`. |
| `facts.ts` | AC-1/AC-3/AC-5/AC-18: assemble the fact set from the ports + `stack.ts` + `setup.ts`. Structure comes from the indexed path set (directory prefixes, depth ≤ `FACT_DIR_DEPTH`) — never a fresh walk. Also produces `allIndexedPaths: Set<string>` (used only for grounding, never sent). **Zero LLM calls on this path.** |
| `schemas.ts` | The raw LLM-facing zod schema (§3). |
| `prompts.ts` | The system prompt (a plain exported constant, following `conventions/prompts.ts:1-11`'s established precedent) + the fact-payload renderer with the drop order from Q1. Repository-derived strings (paths, script text, route strings) are **delimiter-wrapped as untrusted data** using the shared wrapper, never interpolated as instructions; no per-field keyword scanning (`server/CLAUDE.md:41-43`). |
| `grounding.ts` | Pure `groundTour(raw, facts) → { sections, dropped }` (§4). |
| `render.ts` | Maps grounded output → the shared `Onboarding` sections, **and** renders the facts-only skeleton (AC-33/AC-35) — one renderer, two entry points, so a skeleton and a tour can never describe different facts (the "a preview must not lie" discipline of `_shared/skill-render.ts`). |
| `repository.ts` | `getTour(repoId)`, `upsertTour(row)` over the redesigned `onboarding` table. |
| `service.ts` | `getPage(workspaceId, repoId)` and `generate(workspaceId, repoId)`; owns the in-flight guard and the staleness comparison. No `Container` import (`no-container-in-services`). |
| `routes.ts` | Two routes, composed from `container.onboardingService`. |

`server/src/modules/_shared/checkout-paths.ts` — `project-context/paths.ts`
moved verbatim (planner finding 5); `resolveContainedPath` gates **every**
checkout read in `stack.ts`/`setup.ts` before it happens (the spec's
"Security — path containment", SPEC-09 AC-27's precedent).

**Routes** (zod-schema'd params per `server/CLAUDE.md:12-14`; both resolve the
repo through `RepoLookup.getById(workspaceId, repoId)` **first**, which is the
whole of AC-49 — a repo in another workspace 404s before any tour row is read,
exactly as `conventions/service.ts:108-110` does):

```
GET  /repos/:id/tour           → OnboardingPage   (0 LLM calls: AC-19, AC-22, AC-33, AC-37)
POST /repos/:id/tour/generate  → OnboardingPage   (AC-13, AC-20, AC-24, AC-34, AC-38)
```

`GET` returns `{ status, reason?, provenance, facts, tour | null, stale }`.
`POST` returns the same envelope with `status ∈ {generated, generating,
failed, refused}` plus `dropped` (what grounding removed) so the client can be
honest about it. There is no third route: "Regenerate" is the same `POST`.

**Generation flow** (`service.generate`):

1. Resolve repo (workspace-scoped) → 404 if absent; no clone at all → AC-37
   empty state, **no** provider call.
2. `getIndexState`; if the status isn't in `GENERATABLE_STATUSES` or there are
   zero ranked files → **refuse** with a reason, zero provider calls (AC-38).
3. In-flight guard (AC-20): `private inFlight = new Set<string>()` on the
   service. The check-and-insert happens **before the first `await` in the
   generate body**, so Node's single-threaded model makes it atomic; `finally`
   deletes the key. A second call returns `{ status: 'generating' }`
   immediately — it does **not** queue and does **not** await the first, which
   is AC-20's "surface the in-flight state rather than queueing or
   duplicating". This works only because the service is a **process-wide
   singleton**: add a lazy `container.onboardingService` getter
   (`platform/container.ts:155-160`'s shape) and have `routes.ts` read it —
   do **not** `new OnboardingService(...)` per request.
4. Assemble the fact set (`facts.ts`) — no LLM (AC-1).
5. Resolve the model: `resolveFeatureModel(workspaceId, 'onboarding')` →
   `llm(provider)` → **one** `completeStructured({ model, schema, schemaName,
   messages, maxTokens })` — the `conventions/service.ts:112-119` shape
   verbatim (AC-13, AC-15). Provider-side schema-repair reprompts are counted
   in the returned `attempts` and summed `tokensIn/tokensOut`
   (`vendor/shared/adapters.ts:72-79`) — that is AC-14, already implemented by
   the adapters; the module only records it.
6. Ground (§4), render, persist (§5). On any throw from step 5 or a validation
   failure after permitted attempts: **do not write anything**, return
   `status: 'failed'` with the previous tour still stored and still returned
   (AC-24, AC-34, AC-36).
7. Emit one structured log line — model, attempts, tokensIn/Out, costUsd,
   dropped counts — so US-6 ("open the logs and see one call") holds without a
   debugger. Cost comes from `StructuredResult.costUsd`; when the provider
   returns `null`, price it with `container.priceBook.estimate`
   (`platform/container.ts:230-240`), the same source the review path uses.

### 3. The LLM response schema (Q3, decided)

`onboarding/schemas.ts` defines `OnboardingGenerationOutput` — a **separate
raw-response schema**, not the shared `Onboarding` contract:

```
architecture   { title, body, diagram? }
critical_paths { title, intro?, entries: [{ path, reason }] }
run_locally    { title, intro?, steps:   [{ command, reason? }] }
reading_path   { title, intro?, entries: [{ path, reason }] }
first_tasks    { title, intro?, tasks:   [{ title, body, files: string[] }] }
```

Reasoning — all three candidate shapes were considered:

- **Not the `Onboarding` contract directly.** `Onboarding.sections[].body` is
  free markdown; grounding has to reach *inside* each entry to drop an
  unknown path (AC-28), drop an undeclared command (AC-29), strip an external
  link (AC-32) and re-impose the weighted order (AC-27). None of that is
  possible against a blob of markdown — it would degrade into regexing prose.
- **Not a subset of it either** — the raw shape needs per-entry `path`/`reason`
  and `command` fields the DTO simply doesn't have.
- **A separate raw schema, mapped after grounding**, is what
  `conventions/schemas.ts:1-9` already established in this codebase for exactly
  this reason ("narrower than the DB-shaped DTO… the model never assigns
  what's computed server-side"). `render.ts` is the one place raw → `Onboarding`
  happens, so what is stored always matches `Onboarding` exactly.

The model is given the reading-path and critical-path entries **as facts** and
asked only for each one's single-sentence reason (AC-26, AC-27) — it is never
asked to select or order files. Bounds are encoded in the zod schema itself
(`.max(READING_PATH_MAX)` etc.) so an over-long response fails validation and
takes the AC-34 path rather than silently being cut (AC-25 holds regardless of
repository size because the *input* list is already capped).

**Shared contract changes — apply to BOTH `server/src/vendor/shared/contracts/knowledge.ts:28-47`
and `client/src/vendor/shared/contracts/knowledge.ts` (byte-identical today):**

- Tighten `OnboardingSection.kind` from `z.string()` to
  `OnboardingSectionKind = z.enum(['architecture','critical_paths','run_locally','reading_path','first_tasks'])`
  — free, because the contract has zero consumers today, and it makes AC-16
  type-enforced on both sides.
- Add `OnboardingProvenance` (`files_indexed`, `files_excluded`,
  `index_status`, `index_reason?`, `index_sha`, `index_updated_at`,
  `prs_weighted`, `hotness_window_days`, `generated_at?`, `model?`,
  `provider?`, `attempts?`, `tokens_in?`, `tokens_out?`, `cost_usd?`) — AC-21 +
  AC-30 in one object.
- Add `OnboardingStatus = z.enum(['generated','stale','skeleton','degraded','empty','generating','failed','refused'])`,
  `OnboardingFacts` (skeleton facts: stack, ranked files, setup steps, routes,
  each with its evidence), and `OnboardingPage`
  (`{ status, reason, stale, provenance, facts, tour }`).
- `OnboardingLink` (`:29-33`) is unchanged; `path` is repo-relative and
  server-validated (AC-32).

Import runtime values in the client from
`@devdigest/shared/contracts/knowledge`, never the bare barrel
(`client/LEARNINGS.md:276-321`).

### 4. Grounding (AC-27–AC-32) — server-side, onboarding-local, pure

`onboarding/grounding.ts`, a **new small pure function**. It is *structurally*
analogous to `groundFindings` but must not touch, import, or extend it: D9 puts
`reviewer-core` out of scope, and `reviewer-core/CLAUDE.md`'s "Do-not-touch"
names `groundFindings` explicitly. Nothing here enters the review path.

```
groundTour(raw: OnboardingGenerationOutput, facts: FactSet): {
  sections: OnboardingSection[];           // exactly SECTION_KINDS, in order
  dropped: { paths: string[]; commands: string[]; links: string[]; tasks: string[] };
}
```

Inputs it checks against: `facts.allIndexedPaths` (the **full** indexed path
set, not just the 40 sent — AC-28 says "not present in the repository's
index"), `facts.setupCandidates` (exact command strings), and the server's own
ordered reading-path / critical-path entries.

Rules, one per AC:

- **AC-27** — the reading path is rebuilt from the server's weighted-ordered
  entries; the model's response contributes a `reason` looked up **by path**.
  Response order is discarded entirely. A shuffled response renders in weighted
  order; an entry whose reason is missing renders without one (Q4).
- **AC-28** — any `path` (in an entry, a first task's `files`, or a link) not
  in `allIndexedPaths` → that entry is dropped and recorded.
- **AC-29** — a `run_locally` step whose trimmed `command` does not exactly
  match a collected candidate is dropped. No fuzzy matching: a command the repo
  never declared is worse than three steps.
- **AC-31** — the first-tasks section is rendered with a fixed
  "model-suggested" label; a task with no surviving indexed file reference is
  dropped (then Q4 applies).
- **AC-32** — a link target is accepted only if it is repo-relative
  (rejects anything matching `/^[a-z][a-z0-9+.\-]*:/i`, a leading `/` or `//`)
  **and** present in the index. Everything else is dropped, not rewritten.
- **AC-17** — at most one diagram, on the architecture section only; a diagram
  supplied anywhere else is dropped. Validity is the client renderer's job
  (AC-42, `MermaidDiagram.tsx:36-53`) — do not add a server-side Mermaid parser.
- **AC-16** — the output is always the five `SECTION_KINDS` in order; a section
  whose entries all dropped still renders (with its intro/body), because the
  section list is fixed, not response-driven.

### 5. Persistence, freshness and the spend record (AC-21, AC-23, AC-30, AC-36)

Redesign the existing, never-written `onboarding` table in place
(`server/src/db/schema/context.ts:123-129`; planner finding 1 + the free-redesign
rationale in `server/LEARNINGS.md:50-54`):

```
onboarding(
  repo_id            uuid PK → repos.id cascade      -- existing
  json               jsonb  NOT NULL                 -- existing: the grounded Onboarding {sections}
  generated_at       timestamptz NOT NULL default now()  -- existing
  index_sha          text    NOT NULL                 -- AC-21/AC-23 identity
  indexer_version    integer NOT NULL
  index_updated_at   timestamptz
  files_indexed      integer NOT NULL default 0       -- AC-30 provenance, frozen at generation
  files_excluded     integer NOT NULL default 0
  prs_weighted       integer NOT NULL default 0
  provider           text
  model              text    NOT NULL                 -- AC-21
  attempts           integer NOT NULL default 1
  tokens_in          integer NOT NULL default 0
  tokens_out         integer NOT NULL default 0
  cost_usd           double precision
)
```

One row per repo (PK is `repo_id`) — D5's "one repo, one current tour". A row
exists **only** for a successful generation, which is AC-36: a skeleton is
never written. `ON DELETE cascade` from `repos` keeps removal clean, and there
is no `workspace_id` column because every read path resolves the repo through
the workspace first (AC-49).

- Migration: `pnpm db:generate < /dev/null` then `pnpm db:migrate`. **Add-only**
  — no drop, so no rename ambiguity (`server/LEARNINGS.md:64-82`). `NOT NULL`
  without a default is safe **only** because the table has never been written;
  confirm `select count(*) from onboarding;` returns 0 on your dev DB first.
- **Staleness (AC-23)**: computed at read time, never stored —
  `stale = tour.index_sha !== state.lastIndexedSha || tour.indexer_version !== state.indexerVersion || (state.updatedAt > tour.index_updated_at)`.
  The response carries both sides (what it was generated from, and how current
  the index is now) so the page can name both. Nothing regenerates
  automatically (N7).
- **Failure is response-scoped, not persisted.** A failed generation stores
  nothing: `completeStructured` throws after its permitted attempts, so there
  is no usage record to keep, and the previous tour must stay untouched
  (AC-24). No failure history table — the spec asks for a durable record of
  *spend*, and a failed call produced none.

### 6. client — the tour page and the nav fix

| Path | Change |
|---|---|
| `src/app/repos/[repoId]/tour/page.tsx` | Thin route returning `<OnboardingTourView />`; copy the 7-line shape of `repos/[repoId]/context/page.tsx`, **not** `pulls/page.tsx` (`client/LEARNINGS.md:133-158`). The path segment is `tour` — D10/AC-39: no `onboarding` anywhere in the URL. |
| `…/tour/_components/OnboardingTourView/` | `"use client"`; `useParams` + `useActiveRepo` + `useRepoNotFound` gate (`client/LEARNINGS.md:348-360`). Children: `TourToc` (AC-40 — a real `<nav><ol>` of exactly the five sections, anchor-linked), `SectionCard` (`Markdown` + optional `MermaidDiagram`), `RankedList` (used by both critical paths and reading path — renders **position**, path, reason, and an "Open" link via `githubBlobUrl(repo.full_name, provenance.index_sha, path)`, AC-44/N6, opening on the repository host), `SetupSteps` (copy-to-clipboard only — the tree must contain **no** control that executes anything, AC-43), `ProvenanceLine` (AC-30: "N files indexed · M excluded by the index bound · index <status>, updated <when> · K PRs weighted · generated <when> by <model>"), `StatusBanner` (`role="status"` + `aria-live="polite"`, AC-45), `SkeletonFacts` (AC-33/AC-35 — stack, ranked files, setup steps, routes, each with its evidence; no prose, no diagram), plus `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts` and `*.test.tsx`. Every action reachable by keyboard (AC-46) — real `<button>`/`<a>`, no div handlers. |
| `src/lib/hooks/onboarding.ts` (+ barrel entry in `hooks/index.ts`) | `useOnboardingTour(repoId)` (GET) and `useGenerateOnboardingTour(repoId)` (POST). The mutation writes `setQueryData` in `onSuccess`, so it needs `qc.cancelQueries` in `onMutate` (`client/LEARNINGS.md:361-383`). No `fetch` in a component (`client/CLAUDE.md:13-15`). |
| `src/components/app-shell/helpers.ts:29` | **The D10 fix, both halves.** Delete the `pathname.includes("/onboarding")` line and add a segment-exact match for the tour: a tiny local `hasSegment(pathname, seg)` (split on `/`, compare) used as `if (hasSegment(pathname, "tour")) return "onboarding-tour";`. Segment-exact rather than another `includes` because the bug being fixed *is* a substring match, and a new `NAV` entry is what makes it live; `/onboarding` (the add-a-repo screen, `src/app/onboarding/page.tsx`) then correctly falls through to `""`. The other rows keep their `includes` form — narrowing them is out of scope, but note the latent class in `client/LEARNINGS.md`. |
| `src/vendor/ui/nav.ts:21-33` | Add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: <an existing IconName from src/vendor/ui/icons.tsx — do not add one>, href: "/repos/:repoId/tour", gKey: "t" }` to the WORKSPACE group, plus the matching `SHORTCUTS` row at `:75-86` ("g t"). The i18n label `nav.onboarding-tour` already exists (`messages/en/shell.json:19`). |
| `messages/en/onboarding.json` | **Rewrite** (planner finding 6 / D4): keep `title`, `regenerate`, `generate.cta`; replace `generate.body`'s wrong five sections with the authoritative five (AC-16); add section titles, ToC label, provenance line, status/reason strings for every state (generated, stale, skeleton, degraded, failed, refused, empty, generating), copy-step label, "Open on GitHub", "model-suggested" label (AC-31). |

Rendering safety needs **no new code**: `Markdown.tsx` has no `rehype-raw`, so
a `<script>` in a section body is visible text (AC-41), and `MermaidDiagram`
already returns `null` for anything unparseable (AC-42). Reuse both as-is.

### 7. mcp-server — `get_onboarding_tour` (AC-47, AC-48, AC-49)

New `src/tools/get-onboarding-tour.ts`, built on the
`src/tools/get-blast-radius.ts:71-102` pattern (which is the precedent for
wiring a server route through to a tool):

- Input `{ repo: string }` → `resolveRepo(http, input.repo)` →
  `http.get<RawOnboardingPage>('/repos/' + repo.id + '/tour')`. **One GET, no
  POST anywhere in the file** — that is AC-48, enforced by construction.
- Local `Raw*` subset interfaces only; no `@devdigest/shared` alias
  (`mcp-server/CLAUDE.md:14-19`).
- `GET_ONBOARDING_TOUR_DESCRIPTION` — a VERBATIM constant in the style of
  `:14-16`, stating that it returns the **stored** tour or the deterministic
  skeleton with its status/reason, that it never generates one and never causes
  an LLM call or any spend, and that a `skeleton`/`degraded` status means the
  repo has no tour yet — not that the repo has no structure.
- Registered **appended last** in `registerTools`
  (`src/tools/index.ts:29-57`); existing five untouched and unreordered
  (`mcp-server/CLAUDE.md:24-30`). Update that function's "all 5 tools" doc
  comment and the tool table in `mcp-server/README.md`.
- Errors return `{ isError: true, … }`, never throw (`CLAUDE.md:31-34`).
- AC-49 needs nothing here: the tool sends no workspace id, and the server
  scopes the repo lookup through `getContext`.

### Explicitly not built

Personalized tours (N1), any chat/drill-down (N2), tour editing or pinning
(N3), writing the tour into the checkout or a PR (N4 — the unwired
`commitFiles`/`openPullRequest` stay unwired), a share token or public link
(N5), an in-app file viewer (N6), any implicit/scheduled generation (N7),
ranking beyond the indexed set (N8), an e2e flow (N9), non-TS/JS stack support
(N10), an eval harness (N11). Also **not** built: any change to
`file_rank.rank`'s definition, to `getFileRank`/`getTopFilesByRank`/
`getConventionSamples`, or to `reviewer-core`.

## Skills for implementer

Derived from `.claude/skills/pr-self-review/SKILL.md` Phase 3 (the routing
table at lines 127-137) and the catalog in `.claude/skills/README.md:9-24`.
Load the row matching the files you are currently editing, not all at once;
respect each skill's declared scope.

| Path glob in this plan | Skills to load | Why |
|---|---|---|
| `server/src/modules/onboarding/**`, `server/src/modules/_shared/checkout-paths.ts`, `server/src/platform/container.ts` | `onion-architecture`, `fastify-best-practices` | Phase 3 row for `server/src/modules/**`, `platform/**`. The ring rules and the local-port/DI pattern are the difference between this module passing `pnpm arch` with zero new baseline entries and eating one. |
| `server/src/modules/repo-intel/**` (service, repository, `pipeline/rank.ts`, `pipeline/full.ts`, `pipeline/incremental.ts`) | `onion-architecture`, `drizzle-orm-patterns` | Same Phase 3 row, plus the new `pr_files`⋈`pull_requests` aggregate read lives in `repository.ts` and must stay a single grouped query, not an N+1. |
| `server/src/db/schema/context.ts`, `server/src/db/schema/repo-intel.ts` (comments only), `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` | Phase 3 row for `server/src/db/**`. Add-only column migration onto an existing PK'd table; `NOT NULL` without default needs the zero-row precondition. |
| `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `onboarding/schemas.ts`, every route schema in `onboarding/routes.ts` | `zod` | Phase 3 row for `**/contracts/**` and zod schemas. Also the optional-vs-`.nullable()` trap (`server/LEARNINGS.md:396-410`) for the `IndexState` widening. |
| `client/src/app/repos/[repoId]/tour/**`, `client/src/components/app-shell/helpers.ts` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Phase 3 row for `client/src/app/**` and `client/src/components/**`. Thin route + colocated `_components/`, and the `"use client"` boundary. |
| `client/src/lib/hooks/onboarding.ts` | `frontend-ui-architecture`, `react-best-practices` | Phase 3 row for `client/src/lib/**`. |
| `client/**/*.test.tsx` | `react-testing-library` | Phase 3 row. |
| `onboarding/stack.ts`, `onboarding/setup.ts`, `onboarding/grounding.ts`, `_shared/checkout-paths.ts`, `onboarding/prompts.ts` | `security` | Phase 3's "any `.ts`/`.tsx`" row, and the sharpest need here: repository-controlled content (scripts, paths, manifests) → a prompt and a browser, plus containment-gated checkout reads and model-supplied link targets (AC-32, AC-41, AC-43). |
| `mcp-server/src/tools/**` | **Routing gap — no row exists.** | Phase 3's table has no `mcp-server/**` entry; the only row that reaches it is "any `.ts`/`.tsx` → `security`". Planner judgment: load `security` plus `typescript-expert`, and treat `mcp-server/CLAUDE.md`'s own convention list (only `http/client.ts` calls `fetch`, no shared alias, byte-identical descriptions and registration order, handlers never throw) as the governing document. Do **not** substitute `onion-architecture` — its declared scope is `server/src` only. This is the same gap `plans/09-project-context-folder.md` flagged for `mcp-server/src/cli/**`; it is now the second plan to hit it, which is an argument for adding the row to Phase 3. |

Phase 3's "cap at 4" is a *review-pass* budget, not an implementation one.

Root `CLAUDE.md` "Before you finish": append an `engineering-insights` entry to
each touched module's `LEARNINGS.md` — at minimum `server/LEARNINGS.md` (what
turning on `hotness` actually cost, and whether AC-11's identical-output claim
survived contact), `client/LEARNINGS.md` (the `activeKeyFor` substring class of
bug) and `mcp-server/LEARNINGS.md` (adding a sixth tool without disturbing the
cached five).

## Verification

Scoped commands, per module. `pr-self-review` re-runs the full suites before
push regardless.

### server

```
cd server && pnpm typecheck
cd server && pnpm db:generate < /dev/null && pnpm db:migrate
cd server && pnpm exec vitest run \
  test/onboarding-facts.test.ts \
  test/onboarding-stack-setup.test.ts \
  test/onboarding-grounding.test.ts \
  test/onboarding-service.test.ts \
  test/onboarding-render.test.ts \
  test/onboarding.it.test.ts \
  test/repo-intel-rank.test.ts \
  test/repo-intel-service.test.ts \
  test/project-context-paths.test.ts \
  test/contracts.test.ts
cd server && pnpm test          # full suite — justified below
cd server && pnpm arch
```

The **full** server suite is named deliberately, and only for this reason:
`hotness` becomes non-zero on every indexed repo and `IndexState` gains fields,
so every existing repo-intel, repo-map, blast and conventions test is a
potential AC-11 regression — a scoped run cannot prove "identical before and
after". `pnpm arch` must report **zero new** violations; if it fails, run
`pnpm arch:baseline` and `git diff` the baseline — a new entry means a
cross-module import slipped in and must be replaced with a local port, not
baselined (`server/LEARNINGS.md:619-634`).

Before generating the migration: `select count(*) from onboarding;` must return
`0` (planner finding 1), otherwise the `NOT NULL` columns need defaults.

### client

```
cd client && pnpm typecheck
cd client && pnpm exec vitest run \
  "src/app/repos/[repoId]/tour/**" \
  "src/components/app-shell/**" \
  "src/lib/hooks/**"
cd client && pnpm build     # or `pnpm dev` + open /repos/<id>/tour
```

The build/boot step is **not optional**: typecheck + vitest do not prove a new
route boots, and this change adds new `@devdigest/shared` consumers — the exact
trap in `client/LEARNINGS.md:276-321`. **Pass:** the route renders; the page
exposes no control that runs a command (AC-43); the URL contains no
`onboarding` segment (AC-39).

### mcp-server

```
cd mcp-server && pnpm typecheck
cd mcp-server && pnpm exec vitest run test/tools/
```
**Pass:** the new tool returns the stored tour or the skeleton against a fake
`fetchImpl`, issues exactly one GET and no POST, and the five pre-existing
tools' descriptions and registration order are byte-identical to `main`
(`git diff mcp-server/src/tools/` should show additions only).

### Test matrix the scoped files must cover

| Test scenario | ACs |
|---|---|
| Fact assembly against a stubbed provider → zero provider calls; a sentinel string inside a fixture source file is absent from the assembled request | AC-1, AC-5 |
| Fixture checkout with a known manifest + lockfile → expected language/runtime, package manager and frameworks, each naming its evidence file; lockfile is `stat`ed, never read | AC-2 |
| Structure comes from the indexed path set; no filesystem walk is performed during assembly (spy on the walk helper) | AC-3 |
| Fixture manifest declaring `dev`/`install` + an env-example + a compose file → exactly those candidate steps, each with an evidence file | AC-4 |
| Bounded/partial index fixture → coverage facts (indexed count, excluded-by-bound count, status) present in the fact set and in the provenance | AC-18, AC-30 |
| Payload over budget → whole entries dropped in the documented order, nothing truncated mid-entry, budget respected | D12/Q1 |
| Known pagerank + hotness fixture → tour order equals `pagerank * (1 + hotness)` desc, while stored `file_rank.rank` is unchanged | AC-6, AC-12 |
| Two fixture repos, identical graphs, different PR histories → different, reproducible orders; most-changed indexed file has `hotness = 1`; single-commit checkout still yields hotness | AC-7, AC-8 |
| Zero PRs (and all-PRs-outside-the-window) → `hotness = 0` everywhere, order identical to today's pure PageRank, no warning, generation still allowed | AC-9 |
| A PR file path not in the index → ignored, never appears as an entry | AC-10 |
| **AC-11 regression**: for a fixture index, `rank`, `percentile`, `getFileRank`, `getTopFilesByRank`, `getConventionSamples` and `getCriticalPaths()` (no opts) are identical before and after hotness becomes non-zero | AC-11 |
| Trigger a generation against a stubbed provider → exactly one `completeStructured`, zero `complete`/`embed`; a repair reprompt is recorded as `attempts > 1` on the same request, not a second generation | AC-13, AC-14 |
| Model choice comes from the workspace's `onboarding` feature model, falling back to the documented default | AC-15 |
| Stored tour's section kinds equal the five, in order; at most one diagram, on architecture only | AC-16, AC-17 |
| Open the tour page for a repo with no stored tour → skeleton, zero provider calls; repeated loads with a stored tour → zero provider calls | AC-19, AC-22 |
| Two rapid generate calls → one provider request, second returns the in-flight state | AC-20 |
| Successful generation stores index identity, model, attempts, tokens in/out, cost | AC-21 |
| Index advanced past the stored tour's index state → marked stale, both sides named, no automatic regeneration | AC-23 |
| Regeneration that fails → previous tour intact and still returned, alongside a failure status; nothing written | AC-24, AC-34, AC-36 |
| Fixture with thousands of indexed files → ≤10 critical paths, ≤10 reading-path entries, ≤10 setup steps, 3–5 first tasks; each entry is one path + one sentence | AC-25, AC-26 |
| Shuffled model response → rendered reading path still in weighted order; reasons matched by path | AC-27 |
| Response citing `src/does-not-exist.ts` → entry dropped; response step `curl … \| sh` not in the facts → step dropped; external/absolute link target → no link rendered | AC-28, AC-29, AC-32 |
| First-tasks section labelled model-suggested; a task with no indexed file reference is dropped | AC-31 |
| For each degraded reason the index layer can report → skeleton with that reason; skeleton has no prose and no diagram, facts carry evidence | AC-33, AC-35 |
| No checkout and no index → explanatory empty state naming what's missing; generation on an unindexed repo → zero provider calls and a stated reason | AC-37, AC-38 |
| Navigating to `/onboarding` leaves the Onboarding Tour nav entry unhighlighted; `/repos/:id/tour` highlights it; the tour URL contains no `onboarding` segment | AC-39 |
| ToC lists exactly the five sections, each linking to its section | AC-40 |
| A section body containing `<script>` renders as visible text; an invalid diagram renders the section with no diagram and no error state | AC-41, AC-42 |
| Setup steps are copyable text only — no control whose action executes a command | AC-43 |
| Opening a critical-path / reading-path entry links to the repository host at the tour's indexed revision; a path with spaces / non-ASCII / `#` round-trips unchanged | AC-44, edge case |
| Status change (generating → generated / stale / degraded / failed) is announced to assistive tech; every action is keyboard-operable | AC-45, AC-46 |
| MCP tool returns the stored tour, or the skeleton with status + reason; against a repo with no tour it issues no POST and causes zero provider calls | AC-47, AC-48 |
| A tour requested for a repo outside the caller's workspace is not disclosed on any surface (route + MCP) | AC-49 |
| Empty import graph (uniform PageRank) × hotness → pure churn ordering, no throw; a lockfile-dominated history does not open the reading path (junk filter) | edge cases |

`*.it.test.ts` for anything DB-backed (the churn aggregate, tour persistence,
workspace scoping); everything else hermetic against a tmpdir fixture checkout
and a stubbed provider (`server/CLAUDE.md:47-50`).

### Cross-cutting

- `git diff --stat server/src/vendor/shared client/src/vendor/shared` — both
  copies changed, with matching contract edits (root `CLAUDE.md`;
  `pr-self-review` Phase 4 rates a one-sided change HIGH).
- `git status --porcelain server/src/db/migrations` — exactly one new migration
  file, no edit to an existing one (`server/CLAUDE.md:31-32`).
- `git diff mcp-server/src/tools/index.ts` — additions only; the five existing
  `registerTool` calls unmoved and unedited.
- `grep -rn "onboarding" client/src/app/repos` — the route tree must contain no
  such path segment (AC-39).
- Manual acceptance beyond an automated run: generate a tour on a repo with
  real ingested PR history, confirm the reading path differs from the
  pure-PageRank order and that the provenance line's PR count is non-zero
  (US-3). That needs a real provider call and is a human step after this plan
  lands.
