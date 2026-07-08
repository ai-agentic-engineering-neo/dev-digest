# Run Analysis — Export to CI feature (2026-07-08)

> Self-contained handoff for a **fresh chat**. Captures what was built, the multi-agent
> run that built it, where every log lives, the **corrected** cost analysis, and the open
> follow-ups. Nothing here requires the previous conversation to be in context.

---

## 1. What this run produced

A full **spec → plan → implement → review** chain for the **Export to CI** feature
(Worktree B): let a user deploy a tuned review agent to CI via a four-step **Export Wizard**
(Target → Preview → Configure → Install), serialize the agent to a byte-for-byte
`AgentManifest` (`.devdigest/agents/<slug>.yaml`) + skills + empty `memory.jsonl` + a
**self-contained** GitHub Actions workflow + a bundled `agent-runner`, open an atomic
`devdigest/ci` PR, run the *same* `reviewer-core` engine in CI (grounding gate +
`wrapUntrusted`/`INJECTION_GUARD` + deterministic verdict from `ci_fail_on`), and pull the
result back into the studio's **CI Runs** page and the agent's **CI** tab.

**Status:** implemented on branch `emdash/export-to-ci-4sp`, **not committed, not pushed**.
Both review gates passed after **one fix iteration** (0 critical/high outstanding; 36/36 ACs
covered). `reviewer-core/` diff is empty (invariant held). Next step was `pr-self-review`
before any push.

### Key artifacts (in-repo)
| Artifact | Path |
|---|---|
| Spec | `specs/2026-07-08-export-to-ci.md` |
| Implementation plan | `docs/plans/export-to-ci.md` |
| Retro ledger (one row per run) | `docs/retros/ledger.md` |
| This analysis | `docs/retros/2026-07-08-export-to-ci-run.md` |

### New feature source (untracked / modified at time of writing)
- **Server:** new module `server/src/modules/ci/**` (`manifest.ts`, `slug.ts`, `workflow.ts`,
  `constants.ts`, `service.ts`, `repository.ts`, `routes.ts`, `helpers.ts`, `ingest.ts` + colocated
  tests); `server/src/adapters/github/octokit.ts` + `adapters/mocks.ts` (two new `GitHubClient`
  capabilities `listWorkflowRuns`/`downloadArtifact`); DI in `platform/container.ts` +
  `modules/index.ts`; single-writer extension in `modules/reviews/repository.ts` +
  `repository/run.repo.ts` (`createCiAgentRun`/`listCiRunsForWorkspace`); schema
  `db/schema/{ci,runs}.ts` + migration `0012_slim_miss_america.sql` (+ snapshot);
  integration tests `server/test/ci-export.it.test.ts`, `ci-ingest.it.test.ts`.
- **agent-runner (NEW top-level package `@devdigest/agent-runner`):** `agent-runner/**`
  (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/**` real CLI, `CLAUDE.md`), ncc-bundled,
  consumes `reviewer-core` as raw TS via path alias.
- **Client:** `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/**` (Export
  Wizard + CI tab), `client/src/app/ci/**` (CI Runs page + view),
  `client/src/lib/hooks/{ci,ci-runs}.ts`, `client/src/vendor/ui/nav.ts`,
  `client/src/components/app-shell/helpers.ts`, `client/messages/en/ci.json`,
  edits to `AgentEditor/{AgentEditor.tsx,constants.ts}` and `agents/[id]/page.tsx` (`VALID_TABS`).
- **Shared contracts (BOTH copies):** `{server,client}/src/vendor/shared/contracts/eval-ci.ts`
  and `adapters.ts` (add `AgentManifest` to client, `CiInstallation.{status,workflow_version}`,
  `CiRun` repurposed with `actions_job_url` rename + `workflow_override`, two `GitHubClient` port
  methods).
- **Root:** `CLAUDE.md` gained a `@devdigest/agent-runner` Packages-table row.
- Total working-tree delta (feature-scoped): **~8,244 lines added / 410 removed** (session report).

### Decisions baked into the spec/plan (so a fresh chat doesn't re-litigate)
- **Q1** CI runs persist to **`agent_runs` with `source='ci'`** (the `source` enum already existed);
  `ci_runs` table left **untouched/dead**. The `CiRun` DTO is the CI-Runs read shape, backed by `agent_runs`.
- **Q2** Ingest is **pull-based via the GitHub Actions API** on refresh — **no public inbound endpoint**
  (smaller lethal-trifecta surface).
- **Q3** Full flow (PR automation, ingest, Fail-CI-on) is **GitHub Actions only**; CircleCI/Jenkins/CLI
  are **file-download only** (config + "Copy as zip").
- **Q4** `agent-runner` is **owned by this worktree**, bundled into the exported PR (self-contained,
  no marketplace action).
- **Q5** On an LLM/model failure the runner **hard-fails** (non-zero exit, error status, posts nothing;
  no synthetic skeleton).
- **Q6** Slug is **derived from the name** (no persisted `slug` column) with deterministic collision
  disambiguation.
- **Q7** Attached project-context docs do **not** travel in the manifest (like `memory.jsonl`, deferred).
- **Q8** "~2 min to post results" is a **guideline, not an SLA**.
- **SIMP-1** deliberately simple **v1**; the only non-negotiables are the **security invariants**
  (AC-15…19, 21, 27) and the **reviewer-core invariants** (`groundFindings()`, `wrapUntrusted()`+
  `INJECTION_GUARD`, deterministic verdict).
- **SIMP-2** single writer for `agent_runs` = the existing `reviewRepo`; `CiRepository` owns
  `ci_installations` only.
- **SIMP-3** the generated workflow ships the **whole `agent-runner/dist/`** under `.devdigest/runner/`
  (so any ncc dynamic chunk travels), review step runs `node .devdigest/runner/index.js`.
- Workflow constraints: **≤5 implementer agents** (5 tracks, non-overlapping owned paths); fix-loop
  capped at 3; `reviewer-core/` untouched.

---

## 2. The run — agent roster & logs

Orchestrated via the `run-plan` skill after `spec-creator` + `implementation-planner` were run
manually (as separate steps). **29 subagent journals + the main orchestrator loop** (this session,
Opus 4.8 `[1m]`) — 23 top-level (depth-1) + **6 nested** (depth-2) the in-context `<usage>` view hides.

### Log locations (session `25544218-97b2-47c5-a14d-5bb10401dab9`)
- **Main session transcript** (the orchestrator loop — **not** in `subagents/`; must be added for a true total):
  `~/.claude/projects/-Users-ilapa-projects-worktrees-export-to-ci-4sp/25544218-97b2-47c5-a14d-5bb10401dab9.jsonl`
- **Subagent journals** (flat, one file per agent incl. nested):
  `~/.claude/projects/-Users-ilapa-projects-worktrees-export-to-ci-4sp/25544218-97b2-47c5-a14d-5bb10401dab9/subagents/agent-*.jsonl`
  Each has a sibling `agent-*.meta.json` with `agentType` / `description` / `spawnDepth`.

### Agent → journal map
| Journal (`agent-….jsonl`) | depth | type | role |
|---|---|---|---|
| `a161453adf7ad4343` | 1 | Explore | **aborted** initial codebase sweep (fired sync, user redirected to spec-creator) |
| `a550f27cf67be8516` | 1 | spec-creator | Write the spec (spawned 4 researchers; resumed once via SendMessage for Q1–Q4) |
| `a9d4618b9a0072137` | 2 | researcher | agent config & manifest model |
| `a2eaf8a69904752e5` | 2 | researcher | `agent_runs` model & reviewer-core |
| `a4797525d19a98656` | 2 | researcher | server `ci/` routes & GitHub adapter |
| `aab3f69811e484040` | 2 | researcher | client tabs & page conventions |
| `a2c9a75c8ce112b13` | 1 | implementation-planner | The plan (spawned 2 Explore; resumed once to fold verifier findings) |
| `a44dde3dda977c382` | 2 | Explore | GitHub adapter & container |
| `a741b911062a198bf` | 2 | Explore | client CI surfaces & reviewer-core |
| `aff5c472bc6662533` | 1 | architecture-reviewer | Plan structural gate |
| `a9c087626895c8c42` | 1 | plan-verifier | Plan completeness gate |
| `adcb3a68a3dafbf22` | 1 | implementer | T1 shared contracts (Track A) |
| `aca74dc5e1ba21f43` | 1 | implementer | T2 schema + migration (Track A) |
| `ac230aa4a815bcc76` | 1 | implementer | T3 GitHub adapter methods (Track B) |
| `a3319471d404a3d4e` | 1 | implementer | T4 CI generators (Track B, security-critical) |
| `a270a13b9ab137310` | 1 | implementer | T7 agent-runner scaffold (Track C) |
| `a9aa4ed3735f40f40` | 1 | implementer | T9 Export Wizard (Track D) |
| `a99944f7b9f2fc3c9` | 1 | implementer | T11 CI Runs page + nav (Track E) |
| `a089e382dfa346054` | 1 | implementer | T5 CiService export + routes + DI (Track B) |
| `ae34d57ffd2435077` | 1 | implementer | T8 agent-runner CLI (Track C) |
| `ad7263b11ad8b65a9` | 1 | implementer | T12 agent-runner docs (Track C) |
| `a0a52face5a7077a4` | 1 | implementer | T10 CI tab + Fail-CI-on (Track D) |
| `aa572aac728e2c3e3` | 1 | implementer | T6 ingest + bundle embed (Track B) — **critical path** |
| `ad33bda9b7218dc52` | 1 | architecture-reviewer | Implementation structural gate |
| `ace5b485291b6aa80` | 1 | plan-verifier | Implementation completeness gate |
| `a81ec34bdd8c5878e` | 1 | implementer | Fix loop — server CI seams (AC-27/24/19/3) |
| `afdf2b1e385ec0a1b` | 1 | implementer | Fix loop — client tab reachability + workflow_override |
| `ac4e5db027212ed14` | 1 | architecture-reviewer | Re-review (PASS) |
| `a2c6cb789301fcb21` | 1 | plan-verifier | Re-verify (PASS) |

**Launch order:** Explore✗ → spec-creator (→ 4 researchers ∥) → [user Q&A: Q1–Q4 + simplicity directive]
→ planner (→ 2 Explore ∥) → [user Q&A: Q5–Q8] → plan gate (arch ∥ verifier) → [user fold-in]
→ **T1 → T2** (Track A, serial) → **(T3 ∥ T4 ∥ T7 ∥ T9 ∥ T11)** → **(T5 ∥ T8 ∥ T12 ∥ T10)** → **T6**
→ impl gate (arch ∥ verifier) **FAIL** → **fix (server → client)** → re-review (arch ∥ verifier) **PASS**.

**Batches capped at 5 concurrent** to honor the ≤5-agent limit.

---

## 3. Cost & metrics — AUTHORITATIVE (from Claude Code session cost report)

**Total $84.74** · API duration **3h 34m 13s** (wall **7h 10m 1s** incl. idle) · **+8,244 / −410 lines**.

| Model | input | output | cache-read | cache-write | cost |
|---|---|---|---|---|---|
| claude-opus-4-8 | 94.2k | 225.7k | 10.4M | 3.0M | **$30.05** |
| claude-sonnet-5 | 56.8k | 907.8k | 91.2M | 3.6M | **$54.69** |
| **Total** | **151.0k** | **1,133.5k** | **101.6M** | **6.6M** | **$84.74** |

Overall **cache hit ≈ 93.8%** (`cache-read ÷ (input + cache-read + cache-write)`).

### Cost by line item (standard rates: Opus 4.8 $5/$25/$0.50/$6.25, Sonnet 5 $3/$15/$0.30/$3.75 per MTok)
| Category | $ | share |
|---|---|---|
| cache-read | $32.6 | 38% |
| **cache-write** | **$32.3** | **38%** |
| output | $19.3 | 23% |
| input | $0.6 | 1% |

- **Caching (read + write) ≈ 77% of spend**; cache-write is as large as cache-read.
- Single biggest line item: **Opus cache-write ≈ $18.75** — writing the long `[1m]` main-loop prefix to cache.
- **Sonnet is 65% of spend** ($54.69), driven by implementer output + cache-read volume — **not** the
  Opus planning agents. Opus (~35%, $30.05) is mostly the **main orchestrator loop**, not the 3 Opus subagents.
- **Efficiency:** ≈ **$2.35 / AC** (36 ACs), ≈ **$7 / implementation task** (12 tasks), ≈ **$0.01 / line**.

---

## 4. ⚠️ Methodology correction (read before trusting any earlier numbers)

The first retro pass reported **~$183** and **202M cache-read** — **both wrong**. Two compounding errors:

1. **Stale rates.** The estimate assumed Opus at **$15/$75** (Opus 3/4.1-era pricing). **Opus 4.8 is
   ~$5/$25** (with $0.50 cache-read / $6.25 cache-write). Back-solving the real session token counts
   at the correct rates reproduces **$84.74** exactly — so pricing, once fixed, is not the story.
2. **Token over-count + scope miss.** The deep analyzer was pointed only at `subagents/*.jsonl`:
   - it **never counted the main orchestrator loop** (Opus 4.8 `[1m]`, this whole session) — proof:
     session Opus output 225.7k ≫ the Opus subagents' ~110k, so ~115k output is the main loop; and
   - its **cache-read (202M) exceeded the whole session's billed 101.6M** — impossible for the same
     billed quantity. The likely cause: summing `usage` across **resumed-agent transcript replays**
     (`spec-creator` and the `implementation-planner` were each resumed via SendMessage, which replays
     the prior transcript), roughly **doubling** cache/input sums.

**Rules for the next retro (also captured in the ledger note):**
- Sum **`main-session.jsonl` + `subagents/*.jsonl`** — not subagents alone.
- Treat the **Claude Code session cost report** as the source of truth for **$** and for token totals;
  use journals only for per-agent **shape** (ranking, spans, tool/turn counts), and flag that
  resume-heavy agents inflate raw sums.
- A part (subagents) can never exceed the whole (session) — if it does, the analyzer is double-counting.
- Verify per-model **rates** before computing $ (they drift; Opus 4.8 ≠ older Opus pricing).

Per-agent dollar figures in any earlier table are analyzer-inflated (~1.5–2×); the **ranking** is still
directional (Track-B T6 ingest = heaviest agent; the Opus planning/spec pair = heaviest reasoning).

---

## 5. Insights

**What went well**
- **Cache hit ≈ 93.8%** overall (implementers 94–97%); the orchestrator kept only short subagent
  summaries in context — correct, since cache-write of the main prefix is the top line item.
- **Fix loop converged in 1 of 3 iterations**; both gates (arch-reviewer ∥ plan-verifier) ran in
  parallel each round — right call.
- **Owned-path discipline held** across up-to-5 concurrent implementers; every shared/do-not-touch
  file (`container.ts`, `mocks.ts`, both `vendor/shared` copies, `nav.ts`, `reviews/repository.ts`,
  root `CLAUDE.md`) had exactly one owner; **zero file conflicts**.
- **Security invariants survived every gate** — least-privilege permissions, fork-secret withholding
  (`head.repo.fork == false`, `pull_request` not `pull_request_target`), no comment triggers, bundled
  runner; `reviewer-core/` diff empty.

**What was wasteful / hard**
- **Aborted initial Explore** (`a161453…`): I launched a codebase sweep synchronously before the user
  redirected to `spec-creator` — a wasted agent (~21s / 9 tools). Same class as launching an expensive
  agent sync when the user may redirect.
- **Duplicated codebase discovery (3 waves over the same modules):** `spec-creator` fanned out 4
  `researcher`s (agent config, `agent_runs`, ci routes, client conventions) and `implementation-planner`
  then fanned out 2 `Explore`s (GitHub adapter/container, client CI + reviewer-core) — overlapping
  territory, plus the aborted Explore. A single shared codebase pre-read would remove a wave.
- **The entire fix loop came from cross-track integration seams** that per-task unit tests can't see —
  each implementer passed in isolation, but the wiring **between** tasks had 5 gaps: (AC-27) the
  generated workflow had no `actions/upload-artifact` step so pull-ingest had nothing to fetch;
  (AC-24) `post_as` was dropped route→service→workflow (`DEVDIGEST_POST_AS` never emitted); (AC-1/34)
  `agents/[id]/page.tsx` `VALID_TABS` omitted `"ci"` so the tab snapped back to Config; (AC-3) edited
  workflow content reached the zip but not the open_pr request; (AC-19) only `index.js` was shipped,
  not the ncc dynamic chunk.
- **Contract-cascade:** T1's `GitHubClient` port additions left expected typecheck cascade errors in
  `octokit.ts`/`mocks.ts`/`container.ts` until T3/T5 landed — anticipated and briefed, but a reminder
  that shared-contract changes ripple to unowned files.
- **Client vendored-shared drift:** `@devdigest/shared` has **two** physical copies (server + client)
  that had already drifted (`AgentManifest` was missing client-side); every contract change had to land
  in both. (Now captured as a standing memory.)

**Recommendations (actionable)**
1. **Never launch spawning/expensive agents synchronously when the user may redirect** → drop the
   wasted-Explore class. Confirm the approach first, then dispatch discovery.
2. **One shared codebase pre-read** — orchestrator runs a single `Explore`/map once and passes excerpts
   to both `spec-creator` and `implementation-planner` instead of each fanning out its own
   researchers/Explores. Saves a discovery wave (modest $, real wall-clock) and de-duplicates context.
3. **Add an integration-wiring guard after the parallel build, before the review gate** — a small
   "end-to-end seams" task (owning the cross-track contracts: env vars flowing wizard→workflow→runner,
   artifact name, tab registration) **or** put the concrete cross-track contract (endpoint paths, env
   var names, artifact name) into each implementer's brief. This is the **highest-value** change:
   all 5 fix-loop findings were this class, and catching them pre-gate saves a full review round
   (~18% of run cost).
4. **Planner: contract-cascade sweep** — when a shared contract gains fields/methods, enumerate all
   consumers (adapters, mocks, DI, DTO mappers, test fixtures) and assign owners, so the cascade is
   planned rather than discovered.
5. **Cost lever:** keep the **main orchestrator context lean** — cache-write of the long `[1m]` prefix
   is the top single line item ($18.75). Reducing subagent cache-read volume is secondary.
6. **Cache & model routing** are healthy (93.8% hit; Opus for spec/plan reasoning, Sonnet for
   implement/review) — no change.

---

## 6. Open follow-ups (not blocking)
- **Pre-existing** server typecheck failure: 9 `TS18048` errors in
  `server/src/modules/reviews/repository/run.repo.severity.test.ts` (unrelated file, predates this feature).
- **Pre-existing / intermittent:** `server/test/reviews.it.test.ts` flakes under CPU load
  (map-reduce + grounding / dual-provider structured output); passes in isolation. Not touched.
- **Ours, documented:** `ci_runs` table left **dead** by decision (Q1) — could confuse future readers;
  drop or repurpose in a later iteration.
- **Environment:** repo is **not a pnpm workspace** — `reviewer-core/` and `agent-runner/` need their
  own `pnpm install` for typecheck/build to resolve `@devdigest/*` aliases (surfaced by T7; worth
  wiring into `scripts/dev.sh` / CI setup).
- **Runner self-containment:** `actions/upload-artifact@v4`'s `if-no-files-found` left at default
  (`warn`); consider `error` for stricter CI signalling.
- Feature is **not committed / not pushed**; run `pr-self-review` before pushing (this feature reads an
  untrusted diff and writes to public PRs — the exact lethal-trifecta surface the spec hardened).

---

## 7. How to re-analyze in a fresh chat
1. Read this file + `docs/retros/ledger.md` for the corrected numbers.
2. For per-agent shape (spans, tools, turns, ranking), run the workflow-retro analyzer over **both**
   the main transcript and the subagent glob (see §2 paths); remember it **over-counts resume-heavy
   agents** and **misses the main loop** — so its absolute $/token totals are not authoritative.
3. For authoritative **$** and token totals, use the **Claude Code session cost report** (§3), not
   journal sums. Verify per-model rates first (Opus 4.8 ≈ $5/$25, not older Opus pricing).
4. Spec/plan/decisions are in §1; do not re-derive them.
