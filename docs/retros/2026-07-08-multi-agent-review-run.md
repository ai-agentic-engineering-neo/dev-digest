# Run Analysis — Multi-Agent Review feature (2026-07-08)

> Self-contained handoff for a **fresh chat**. Captures what was built, the multi-agent
> run that built it, where every log lives, the **corrected** cost analysis, and the open
> follow-ups. Nothing here requires the previous conversation to be in context.

---

## 1. What this run produced

A full **spec → plan → implement → review** chain for the **Multi-Agent Review** feature
(Worktree A): let a reviewer fan a PR out to a chosen *set* of agents in one parallel pass,
group the fan-out into one persistent multi-agent run, and read it back as per-agent columns
+ a deterministic "where agents disagree" block, with live status and a pre-run estimate.

**Status:** implemented on branch `emdash/multi-agents-review-v1x`, **not committed, not pushed**.
Review gate passed (0 critical/high; 14/14 tasks, 9/9 requirements). `reviewer-core/` diff is
empty (AC-24 holds). Next step was `pr-self-review` before any push.

### Key artifacts (in-repo)
| Artifact | Path |
|---|---|
| Spec | `specs/2026-07-08-multi-agent-review.md` |
| Implementation plan | `docs/plans/multi-agent-review.md` |
| Retro ledger (one row per run) | `docs/retros/ledger.md` |
| This analysis | `docs/retros/2026-07-08-multi-agent-review-run.md` |

### New feature source (untracked at time of writing)
- **Server:** `server/src/modules/reviews/multi-agent-service.ts`, `.../multi-agent-conflicts.ts`,
  edits to `reviews/{routes,repository,run-executor}.ts` and `agents/{service,repository,helpers}.ts`;
  migration `server/src/db/migrations/0012_productive_cannonball.sql` (+ snapshot);
  `server/src/db/schema/runs.ts` (`multiRunId` FK).
- **Client:** `client/src/app/multi-agent-review/**` (page + `[id]` results route + `_components`),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/AgentPicker/**` (replaced `RunReviewDropdown`),
  `client/src/components/RunTraceDrawer/**` (moved from under the PR route → shared),
  `client/src/lib/hooks/multiAgentReview.ts`, `client/src/lib/utils/multiAgentEstimate.ts`,
  `client/messages/en/{agentPicker,multiAgentReview}.json`, `client/src/vendor/ui/nav.ts`.
- **Shared contracts (both copies):** `{server,client}/src/vendor/shared/contracts/{observability,knowledge}.ts`.
- Total working-tree delta: **77 changed/new entries**; ~3.5k lines added, ~185 removed (session report).

### Decisions baked into the spec/plan (so a fresh chat doesn't re-litigate)
- **D-1** conflict matcher lives on the **server**, over persisted findings.
- **D-2** fan-out made **parallel** (`Promise.allSettled`) in `reviews/run-executor.ts`.
- **D-3** new routes `POST /pulls/:id/multi-agent-run` + `GET /pulls/:id/multi-agent` (contracts already existed in `observability.ts`).
- **D-4** only **Accept/Dismiss** functional; Learn / Reply / Turn-into-eval are visible placeholders.
- **SIMP-1** conflict match = **same file + overlapping line ranges only** (deterministic, no LLM/embeddings).
- **SIMP-2** pre-run estimate folded into the **agents-list** response (no separate endpoint); client computes sum(cost)/max(time).
- **SIMP-3** Columns + Tabs are two layouts over **one** shared component set.
- **Q1** read route returns the **latest** multi-run + optional `?multiRunId=`.
- Workflow constraints: implementers **wrote no tests** (self-verify = typecheck + existing suites); fix-loop capped at 2 subagents; `ci/` and `agent-runner/` untouched.

---

## 2. The run — agent roster & logs

Orchestrated via the `run-plan` skill after `spec-creator` + `implementation-planner` were run
manually. **12 subagent journals + the main orchestrator loop** (this session, Opus 4.8 `[1m]`).

### Log locations (session `b86ddb50-9b7a-48c8-9a56-44a251ec05dd`)
- **Main session transcript** (the orchestrator loop — **not** in `subagents/`, must be added for a true total):
  `~/.claude/projects/-Users-ilapa-projects-worktrees-multi-agents-review-v1x/b86ddb50-9b7a-48c8-9a56-44a251ec05dd.jsonl` (~3.0 MB)
- **Subagent journals** (flat, one file per agent incl. nested; ~8.7 MB total):
  `~/.claude/projects/-Users-ilapa-projects-worktrees-multi-agents-review-v1x/b86ddb50-9b7a-48c8-9a56-44a251ec05dd/subagents/agent-*.jsonl`
  Each has a sibling `agent-*.meta.json` with `agentType` / `description` / `spawnDepth`.

### Agent → journal map
| Journal (`agent-….jsonl`) | depth | type | role |
|---|---|---|---|
| `ac9a7f9083da8ca15` | 1 | spec-creator | Create the spec (spawned 3 researchers) |
| `ad93a4f5c1a1f6c17` | 2 | researcher | Research server review flow |
| `ad5b3c1a2b34c71e9` | 2 | researcher | Research client review UI |
| `a2089faad1d5144a9` | 2 | researcher | Research reviewer-core match rule |
| `ae21505804e33e6c2` | 1 | implementation-planner | **rejected launch** (fired synchronously, user interrupted) |
| `ac0621c3f989ae929` | 1 | implementation-planner | The real plan |
| `abf65220229ba1694` | 1 | implementer | Phase 0 foundation (T1–T4) |
| `aa58fe0ba82fb27a9` | 1 | implementer | Track A — server (T5–T9) |
| `a2c7c6fd176bb8c4b` | 1 | implementer | Track B — PR picker (T10) |
| `a203441409d00506e` | 1 | implementer | Track C — multi-agent page (T11–T14) — **critical path** |
| `a063041c79c3ca340` | 1 | architecture-reviewer | Structural gate |
| `a7e5fc792e7e56f50` | 1 | plan-verifier | Completeness gate |

**Launch order:** spec-creator (→ 3 researchers ∥) → [user Q&A + simplifications] → planner#1 ✗ →
planner#2 → impl-P0 → (impl-A ∥ impl-B ∥ impl-C) → (arch-reviewer ∥ plan-verifier) → orchestrator 1-line fix.

---

## 3. Cost & metrics — AUTHORITATIVE (from Claude Code session cost report)

**Total $50.01** · API duration **1h 54m** (wall 6h 55m incl. idle) · ~3.5k lines added / 185 removed.

| Model | input | output | cache-read | cache-write | cost |
|---|---|---|---|---|---|
| claude-opus-4-8 | 67.9k | 182.9k | 15.4M | 2.2M | **$26.13** |
| claude-sonnet-5 | 22.0k | 369.5k | 42.8M | 1.4M | **$23.88** |
| **Total** | **89.9k** | **552.4k** | **58.2M** | **3.6M** | **$50.01** |

### Cost by line item (standard rates: Opus $5/$25/$0.50/$6.25, Sonnet $3/$15/$0.30/$3.75 per MTok)
| Category | $ | share |
|---|---|---|
| cache-read | $20.5 | 41% |
| **cache-write** | **$19.0** | **38%** |
| output | $10.1 | 20% |
| input | $0.4 | 1% |

- **Caching (read + write) ≈ 79% of spend**; cache-write is nearly as large as cache-read.
- Single biggest line item: **Opus cache-write ≈ $13.75** — writing the long `[1m]` main-loop prefix to cache.
- Opus (~52%) is dominated by the **main orchestrator loop**, not the 3 Opus subagents.
- Rates were standard; Sonnet intro pricing ($2/$10, active through 2026-08-31) was **not** what the $50.01 reflects.

---

## 4. ⚠️ Methodology correction (read before trusting any earlier numbers)

The first retro pass reported **~$73** and **112M cache-read** — **both wrong**. Root causes:

1. **Scope miss:** the deep analyzer was pointed only at `subagents/*.jsonl`, so it **never counted
   the main orchestrator loop** (Opus 4.8 `[1m]`, this whole session). Proof: session Opus output
   182.9k ≫ the 3 Opus subagents' ~103k — the extra ~80k is the main loop.
2. **Over-count:** despite missing the main loop, the analyzer's cache-read (112M) **exceeded the whole
   session's** (58M) — impossible for the same billed quantity. It roughly **doubled** cache/input sums,
   most likely by summing `usage` across **resumed-agent transcript replays** (spec-creator and the
   planner were resumed via SendMessage; each resume replays the prior transcript).
3. **Rates were fine.** Recomputing $50.01 from the session's own token counts at standard rates
   reproduces it — the error was **token counts, not tarpricing**.

**Rules for the next retro:**
- Sum **`main-session.jsonl` + `subagents/*.jsonl`** — not subagents alone.
- Treat the **Claude Code session cost report** as the source of truth for $; use journals only for
  per-agent *shape* (ranking, spans, tool counts), and flag that resume-heavy agents inflate raw sums.
- A part (subagents) can never exceed the whole (session) — if it does, the analyzer is double-counting.

Per-agent dollar figures in any earlier table are analyzer-inflated (~1.7×); the **ranking** is
still directional (Track C = most expensive Sonnet agent; spec-creator = most expensive Opus agent).

---

## 5. Insights (corrected)

**What went well**
- Cache hit ~94% overall; orchestrator kept only short subagent summaries in context (correct — it directly limits the biggest line item).
- Clean gate → **0 fix-loop iterations**; arch-reviewer ∥ plan-verifier ran in parallel (right call).
- Owned-path discipline held across 3 concurrent implementers; no file conflicts.

**What was wasteful / hard**
- **Rejected planner launch** (`ae2150…`): fired with `run_in_background:false`, user interrupted, relaunched — a wasted agent.
- **Track C overloaded** (`a20344…`): 4 tasks, ~88k output, 157 tools, 240 turns, 1348s — ~2× siblings and the critical path. The plan **offered a C1/C2 split** that went unused.
- **Cache-write on the `[1m]` main loop is the dominant cost**, not subagent cache-read as first claimed.
- **Contract-cascade gap:** the `Agent` field addition broke 3 files no Phase 1 task owned; caught early by impl-P0, folded into A/B via re-brief.
- One **cross-track integration bug** (AgentPicker route addressing) — both implementers flagged it; orchestrator fixed it with a 1-line edit before the gate.

**Recommendations (unchanged by the cost recount — they're about waste/wall-clock)**
1. Never launch spawning/expensive agents synchronously when the user may redirect → drop the wasted-planner class.
2. Take the plan's C1/C2 split for the heaviest track by default when wall-clock matters → ~8–10 min off Phase 1 at ~zero extra tokens (cache-shared).
3. Planner: add a **contract-cascade sweep** — when a shared contract gains required fields, enumerate all consumers (DTO mappers, test fixtures) and assign owners.
4. **Cost lever (corrected):** keep the **main orchestrator context lean**; cache-write of the long prefix is the top line item. Reducing subagent cache-read volume is secondary.

---

## 6. Open follow-ups (not blocking)
- **Pre-existing** server typecheck failure: `TS18048` in `server/src/modules/reviews/repository/run.repo.severity.test.ts` (unrelated file, predates this feature).
- **Ours, low/documented:** the 6 multi-run queries live inline in `reviews/repository.ts` rather than a `multi-agent.repo.ts` split (owned-path constraint); easy later extraction.
- **Ours, cosmetic:** stale doc-comment naming `RunReviewDropdown` in `client/src/lib/hooks/reviews.ts:162`.
- **Pre-existing:** `Skill` contract copy drift + hardcoded strings in `PrDetailHeader.tsx` (flagged by arch-reviewer; not introduced here).
- Feature is **not committed / not pushed**; run `pr-self-review` before pushing.

---

## 7. How to re-analyze in a fresh chat
1. Read this file + `docs/retros/ledger.md` for the corrected numbers.
2. For per-agent shape (spans, tools, turns), run the workflow-retro analyzer over **both** the main
   transcript and the subagent glob (see §2 paths); remember it over-counts resume-heavy agents.
3. For authoritative $, use the Claude Code session cost report — not journal sums.
4. Spec/plan/decisions are in §1; do not re-derive them.
