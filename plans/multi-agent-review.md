# Development Plan: Multi-Agent Review

- **Status:** done
- **Goal:** On `/repos/:repoId/multi-agent` the user picks a PR and up to 10 agents, runs them in parallel (one `POST /pulls/:id/review {agentId}` each), and compares scores, findings, time and cost in Columns or Tabs. The page also shows where the agents disagree, can filter the findings to those conflicts only, opens any run's trace, and lets the user go back and run again. Pre-run estimates come from a new `GET /agents/run-estimates`.
- **Specs:** [client/specs/multi-agent-review.md](../client/specs/multi-agent-review.md) (29 AC, decisions Q-a..Q-g) · [server/specs/multi-agent-review.md](../server/specs/multi-agent-review.md) (8 AC). Design reference (layout only): `docs/design/devdigest-2/screen_multiagent.jsx`, `screenshots/focus-persona-cols.png`, `focus-persona-tabs.png` (git-ignored locally).
- **Packages:** server · client
- **Out of scope:**
  - Any change to `POST /pulls/:id/review`, `RunRequest`, the run executor or the route rate limit (Q-a).
  - A server-side multi-agent run entity, `POST /pulls/:id/multi-agent-run`, server-computed conflicts.
  - Agent `color`/`icon` DB columns, migrations, an index on `agent_runs` (no migration in this feature).
  - Copy about "worktrees" / "p-queue"; the design's hard-coded `PERSONAS` and `#482` fallbacks.
  - An e2e flow (`e2e/specs/*.flow.json`): no spec AC asks for one, and running agents needs an LLM. Follow-up: an LLM-free flow for the config phase.
  - The "require ≥2 flaggers" conflict refinement (Q-c follow-up).

## Global constraints

- **No edits** in `*/src/vendor/shared/**` (pr-self-review blocks it, non-waivable), `server/src/db/migrations/**`, `server/clones/**`, lockfiles, any `INSIGHTS.md`. `Conflict` / `ConflictTake` from `@devdigest/shared` are reused **as types only** (`import type`).
- New API shape = module-local type in `server/src/modules/agents/domain.ts` + client mirror in `client/src/lib/types.ts` (pattern: `SkillImportPreview`).
- `src/vendor/ui` (`@devdigest/ui`) edits are limited to **one `NAV` entry in `client/src/vendor/ui/nav.ts`** (T11; precedent: commits 18731f3 and 546fa9f added Skills/Conventions there). The kit is NOT changed. Kit `Checkbox` has no `disabled` prop, and the kit `Tabs` label is `string` only. So the agent pick card uses a native `<input type="checkbox">`, and Tabs view builds its own `role="tablist"`.
- NAV labels are literal English by vendored convention (`"Pull Requests"`, `"Conventions"`). The new `"Multi-Agent Review"` label follows that. **Every other** user-visible string goes through next-intl: namespace `runs` (plus one `prReview` key). Only T0 edits message files.
- Colors only via CSS variables: agent color `var(--viz-N)`, tints `color-mix(in srgb, var(--viz-N) 12%, transparent)`, severity `var(--crit|--warn|--sugg)`, score `var(--ok|--warn|--crit)`. No hex in new files.
- Client: no `fetch`/`api.*` in components; import `@devdigest/ui` only from the barrel; `@/…` alias outside the route subtree, relative paths inside it. No new aggregate barrels. Server data only in TanStack Query (never copied into state).
- Live updates use only the existing mechanisms: `usePrRuns` polling (4s while a run is `running`) and SSE `useRunEvents`. No third mechanism (client/CLAUDE.md → Gotchas).
- Server: onion rings route → service → repository; Drizzle only in the repository; every query filters `workspaceId` from `getContext`; `node scripts/check-architecture.mjs` adds no new violations; baseline only shrinks.
- Windows: run bins via `node node_modules/...` inside the package, never `pnpm <script>`. Vitest filters below are file-name substrings without slashes. Don't put `[repoId]` in a filter, because brackets are read as a regex class.
- Planner decisions inside the spec's freedom (implement as written):
  - A `done` run whose review is not in the `["reviews", prId]` cache yet counts as `running`. The executor writes the review before it marks the run done (`server/src/modules/reviews/run-executor.ts:232` insertReview → `:257` completeAgentRun), so that state only means "cache not refreshed yet".
  - Start states (pending / started run_id / failed) are kept per PR in `MultiAgentView`. A started agent's column follows **its** `run_id` (no stale-run flash, see Q-g). After a reload, columns fall back to "latest run per agent".
  - `GET /agents/run-estimates` also skips done runs with `duration_ms IS NULL`.

## Contracts (Wave 0)

### C1 — REST + server DTO (shape fixed here; server file owned by T1, client mirror by T0)
```ts
// server/src/modules/agents/domain.ts  (pure: no zod/drizzle imports)
export interface RunEstimateSample { agentId: string; durationMs: number; costUsd: number | null } // newest N done runs per agent
export interface AgentRunEstimate { agent_id: string; sample_size: number; avg_duration_ms: number; avg_cost_usd: number | null }
export interface AgentRunEstimates { estimates: AgentRunEstimate[] }
export function aggregateRunEstimates(samples: readonly RunEstimateSample[]): AgentRunEstimate[];
//   group by agentId; sample_size = count; avg_duration_ms = Math.round(mean durationMs);
//   avg_cost_usd = mean of non-null costUsd, null if all null; agents with 0 samples absent; sorted by agent_id asc
// server/src/modules/agents/constants.ts
export const ESTIMATE_SAMPLE_SIZE = 5;
// REST: GET /agents/run-estimates → 200 AgentRunEstimates   (no params/body; workspace from getContext)
//       response schema (routes.ts): z.object({ estimates: z.array(z.object({ agent_id: z.string().uuid(),
//         sample_size: z.number().int().min(1), avg_duration_ms: z.number().int().min(0),
//         avg_cost_usd: z.number().min(0).nullable() })) }) satisfies z.ZodType<AgentRunEstimates>
```

### C2 — client mirror + URL state (T0)
```ts
// client/src/lib/types.ts  (append; comment "mirrors server/src/modules/agents/domain.ts")
export interface AgentRunEstimate { agent_id: string; sample_size: number; avg_duration_ms: number; avg_cost_usd: number | null }
export interface AgentRunEstimatesResponse { estimates: AgentRunEstimate[] }

// client/src/lib/multi-agent-url.ts  (consumers: multi-agent route + pulls/[number] RunReviewDropdown)
export type MultiAgentPhase = "config" | "results";
export type MultiAgentViewMode = "columns" | "tabs";
export interface MultiAgentUrlState {
  pr: number | null;          // PR number (positive int), else null
  agents: string[] | null;    // null = param absent (→ default selection); [] = explicitly none
  phase: MultiAgentPhase;     // "results" only when the param === "results"
  view: MultiAgentViewMode;   // "tabs" only when the param === "tabs"
}
export function parseMultiAgentSearch(sp: { get(name: string): string | null }): MultiAgentUrlState;
//   agents: split on ",", trim, drop empty, dedupe (order kept)
export function multiAgentHref(repoId: string, state: Partial<MultiAgentUrlState>): string;
//   `/repos/${encodeURIComponent(repoId)}/multi-agent` + query in order pr, agents, phase, view;
//   omits null/undefined, phase "config", view "columns"; agents [] → "agents=" (kept)
```

### C3 — route types + constants (T0)
```ts
// client/src/app/repos/[repoId]/multi-agent/constants.ts
export const MAX_AGENTS_PER_RUN = 10;          // POST /pulls/:id/review rateLimit 10/min (server/src/modules/reviews/routes.ts:29)
export const MAX_GRID_COLUMNS = 5;
export const COLUMN_MIN_WIDTH_PX = 220;
export const AGENT_COLOR_COUNT = 6;            // --viz-1..6
export const SCORE_OK = 75;                    // tab score tone: ≥75 ok (= kit CircularScore, user decision 2026-11-06), ≥50 warn, else crit
export const SCORE_WARN = 50;
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 }; // Severity from @devdigest/shared

// client/src/app/repos/[repoId]/multi-agent/types.ts
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
export interface ResolvedPr { id: string; number: number; title: string }
export interface SelectedAgent { id: string; name: string; model: string; colorIndex: number } // colorIndex 1..6
export type StartState =
  | { status: "pending" }
  | { status: "started"; run_id: string }
  | { status: "failed"; error: string };
export type StartStates = Readonly<Record<string, StartState>>; // key = agent id
export type ColumnState =
  | { kind: "starting" }
  | { kind: "failed_to_start"; error: string }
  | { kind: "running"; run: RunSummary }
  | { kind: "done"; run: RunSummary; review: ReviewRecord }
  | { kind: "failed"; run: RunSummary }
  | { kind: "cancelled"; run: RunSummary };
export interface AgentColumnView { agent: SelectedAgent; state: ColumnState; findings: FindingRecord[] } // findings sorted; [] unless done
export interface RunTotals { agent_count: number; wall_ms: number | null; cost_usd: number | null }
export interface EstimateTotal { duration_ms: number; cost_usd: number | null }
```

### C4 — pure helpers (T4)
```ts
// multi-agent/helpers.ts
export function agentColorIndex(agentId: string, agentIds: readonly string[]): number;
//   (index of agentId in a sorted copy of agentIds) % AGENT_COLOR_COUNT + 1; unknown id → 1
export function defaultSelection(agents: readonly Agent[]): string[];            // enabled, list order, ≤ MAX_AGENTS_PER_RUN
export function toSelectedAgents(agents: readonly Agent[], ids: readonly string[] | null): SelectedAgent[];
//   ids null → defaultSelection; unknown ids dropped; result in `agents` list order; ≤ MAX_AGENTS_PER_RUN;
//   colorIndex computed over ALL agents' ids
export function latestRunPerAgent(runs: readonly RunSummary[]): Map<string, RunSummary>;
//   newest by ran_at (null = oldest), independent of input order; agent_id null ignored
export function sortFindings(findings: readonly FindingRecord[]): FindingRecord[];  // SEVERITY_RANK desc, file asc, start_line asc
export function buildColumns(agents: readonly SelectedAgent[], runs: readonly RunSummary[],
  reviews: readonly ReviewRecord[], startStates: StartStates): AgentColumnView[];
//   per agent: start pending → starting; failed → failed_to_start; started(run_id) → that run if listed, else starting;
//   no start state → latestRunPerAgent; no run → starting. Run status running|null|unknown → running;
//   done + review with same run_id → done (findings = sortFindings(review.findings)); done without review → running;
//   failed → failed; cancelled → cancelled
export function runTotals(columns: readonly AgentColumnView[]): RunTotals;
//   wall_ms = max duration_ms over runs with status done|failed|cancelled (null if none);
//   cost_usd = sum of non-null cost_usd over all column runs (null if none); agent_count = columns.length
export function aggregateEstimate(selectedIds: readonly string[], estimates: readonly AgentRunEstimate[]): EstimateTotal | null;
//   only selected agents that have an estimate; duration = max avg_duration_ms; cost = sum of non-null avg_cost_usd
//   (null if none); null when no selected agent has an estimate
export function formatSeconds(ms: number): string;                               // 8240 → "8.2"
export function scoreTone(score: number): "ok" | "warn" | "crit";                // SCORE_OK / SCORE_WARN
// multi-agent/conflicts.ts
export function countedColumns(columns: readonly AgentColumnView[]): AgentColumnView[]; // state.kind === "done"
export function findConflicts(columns: readonly AgentColumnView[]): Conflict[];  // Conflict from @devdigest/shared
export function conflictFindingIds(columns: readonly AgentColumnView[]): Set<string>;
//   Rule Q-c: only counted columns; < 2 counted → [] / empty set. Locations = findings of counted agents grouped
//   per file, merged transitively when a.start_line ≤ b.end_line && b.start_line ≤ a.end_line. Conflict when
//   ≥1 counted agent has no finding there, or the flagging agents' verdicts differ (agent verdict = its highest
//   severity in the location). Conflict: file; line = min start_line; title = highest-severity finding's title
//   (tie → first in column order); takes = one per counted agent in column order:
//   { agent_id, persona: agent name, verdict: Severity | "ignored", note: that finding's title | "" }.
//   Result sorted by file, then line. Accepted/dismissed findings count. Category is ignored.
```

### C5 — hooks (T5)
```ts
// client/src/lib/hooks/agents.ts
export function useAgentRunEstimates(): UseQueryResult<AgentRunEstimate[], Error>;
//   key ["agent-run-estimates"]; api.get<AgentRunEstimatesResponse>("/agents/run-estimates"); select r => r.estimates; staleTime 60_000
// client/src/lib/hooks/reviews.ts
export type AgentRunStart =
  | { agent_id: string; ok: true; run_id: string }
  | { agent_id: string; ok: false; error: string };
export function useRunReviewsParallel(prId: string | null | undefined): UseMutationResult<AgentRunStart[], Error, string[]>;
//   mutationFn(agentIds): Promise.allSettled(agentIds.map(id => api.post<ReviewRunResponse>(`/pulls/${prId}/review`, { agentId: id })))
//   — all requests created before any is awaited; body is ALWAYS { agentId } (never all);
//   fulfilled → run_id = res.runs.find(r => r.agent_id === id)?.run_id (missing → ok:false);
//   rejected → ok:false, error = errorMessage(reason). onSettled: invalidate ["pr-runs", prId], ["pr-active-runs", prId], ["reviews", prId].
```

### C6 — component props (exact; owner in brackets)
```ts
// [T3] client/src/components/agent-badge/index.ts → AgentBadge, agentColorVar, agentTint
export function AgentBadge(props: { colorIndex: number; size?: number; label?: string }): JSX.Element;
//   Cpu icon on agentTint background, icon color agentColorVar; label → role="img" + aria-label, else aria-hidden. No useTranslations.
export function agentColorVar(colorIndex: number): string;   // "var(--viz-N)"
export function agentTint(colorIndex: number): string;       // "color-mix(in srgb, var(--viz-N) 12%, transparent)"
// [T6] .../MultiAgentResults/_components/AgentColumnCard
{ column: AgentColumnView; visibleFindings: FindingRecord[]; filtered: boolean;
  onViewTrace: (runId: string) => void; onRetry: (agentId: string) => void }
// [T7] .../MultiAgentResults/_components/ConflictsSection
{ conflicts: Conflict[]; agents: readonly SelectedAgent[]; countedCount: number;
  onlyConflicts: boolean; onToggleOnlyConflicts: (on: boolean) => void }
// [T8] .../MultiAgentResults/_components/TabsView
{ prId: string; columns: readonly AgentColumnView[]; onlyFindingIds: ReadonlySet<string> | null;
  onViewTrace: (runId: string) => void; onRetry: (agentId: string) => void }
// [T9] multi-agent/_components/RunConfig
{ repoId: string; prNumber: number | null; selectedIds: readonly string[]; onSelectPr: (prNumber: number) => void;
  onChangeAgents: (ids: string[]) => void; onRun: () => void; isStarting: boolean }
// [T10] multi-agent/_components/MultiAgentResults
{ pr: ResolvedPr; agents: readonly SelectedAgent[]; view: MultiAgentViewMode; startStates: StartStates;
  onRetry: (agentId: string) => void; onConfigure: () => void; onChangeView: (view: MultiAgentViewMode) => void }
// [T12] .../MultiAgentView/hooks/useMultiAgentRun.ts
export function useMultiAgentRun(prId: string | null): { startStates: StartStates; start: (agentIds: string[]) => Promise<void>; isStarting: boolean };
```

### C7 — i18n keys (T0 adds all; nobody else edits message files)
`client/messages/en/runs.json`. Keep every existing key not listed here.
```jsonc
"page.view":   { "columns": "Columns", "tabs": "Tabs", "label": "Results view" },               // values rewritten + label
"page.meta":   "{count, plural, one {# agent} other {# agents}} · {duration}s total",           // REWRITE (no p-queue, no {cost})
"page.metaRunning": "{count, plural, one {# agent} other {# agents}} · running…",
"page.noRun":  { "title": "No runs for these agents yet",
                 "body": "None of the selected agents has reviewed this pull request yet. Configure a run to start.",
                 "cta": "Configure run" },                                                         // replaces title/bodyReady/bodySelect/cta
"config": { "title": "Run a Multi-Agent Review",
            "intro": "Pick a pull request and the agents to run on it. They review it in parallel, then you compare their scores, findings, time and cost side by side.",
            "stepPr": "Pull request", "stepAgents": "Agents to run", "pickPrFirst": "Pick a pull request first",
            "selectAll": "Select all", "clearAll": "Clear all", "disabled": "disabled",
            "capHint": "Up to {max} agents per run (API rate limit)",
            "estimate": "≈ {seconds}s · {cost}", "totalEstimate": "≈ {seconds}s · {cost} total",
            "run": "{count, plural, =0 {Select agents} one {Run 1 agent} other {Run multi-agent review (#)}}" },
"results": { "configure": "Configure run",
             "subtitle": "{count, plural, one {# selected agent} other {# selected agents}} · parallel" },
"column":  { /* keep noFindings, findingsCount */ "filteredCount": "{shown} of {total} findings", "duration": "{seconds}s",
             "starting": "Starting…", "running": "Running…", "failedToStart": "Failed to start",
             "failed": "Failed", "cancelled": "Cancelled", "retry": "Retry" },
"conflicts": { /* keep title, onlyConflicts, didNotFlag */ "empty": "Agents agree on every flagged location",   // REWRITE
               "needTwo": "Need at least two finished agents to compare", "noNote": "—" },
"tabs":    { /* keep noSummary */ "label": "Agents" }
```
`client/messages/en/prReview.json` → `runReview.compareAgents`: `"Compare agents…"`.
Existing keys reused as-is: `runs.viewTrace`, `runs.page.title|crumb|selectPr|prItem|noAgents.*`, `runs.severity.critical|warning|suggestion`.

## File ownership map

Paths under `MA/` mean `client/src/app/repos/[repoId]/multi-agent/`. `RES/` means `MA/_components/MultiAgentResults/`. `PRD/` means `client/src/app/repos/[repoId]/pulls/[number]/_components/`.

| File | Task | New / Modified |
|---|---|---|
| `client/src/lib/types.ts` | T0 | M |
| `client/messages/en/runs.json` | T0 | M |
| `client/messages/en/prReview.json` | T0 | M |
| `client/src/lib/multi-agent-url.ts`, `multi-agent-url.test.ts` | T0 | N |
| `MA/types.ts`, `MA/constants.ts` | T0 | N |
| `server/src/modules/agents/domain.ts` | T1 | N |
| `server/src/modules/agents/constants.ts`, `repository.ts`, `service.ts`, `routes.ts` | T1 | M |
| `server/test/agents-run-estimates.test.ts`, `agents-run-estimates.it.test.ts` | T1 | N |
| `server/README.md` (API map line 75) | T1 | M |
| `PRD/FindingCard/{FindingCard.tsx,FindingCard.test.tsx,constants.ts,helpers.ts,index.ts,styles.ts}` → `client/src/components/finding-card/<same names>` | T2 | moved (old deleted, new) |
| `PRD/RunTraceDrawer/**` (18 files: `RunTraceDrawer.tsx`, `RunTraceDrawer.test.tsx`, `constants.ts`, `helpers.ts`, `index.ts`, `styles.ts`, `_components/atoms.tsx`, `_components/{FindingsSection,PromptBlock,PromptModalBody,ToolCallRow,TraceBody,TraceSection}/{<Name>.tsx,index.ts}`) → `client/src/components/run-trace-drawer/<same tree>` | T2 | moved |
| `PRD/FindingsPanel/FindingsPanel.tsx` | T2 | M (import) |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | T2 | M (import) |
| `client/src/components/agent-badge/{AgentBadge.tsx,index.ts,styles.ts,helpers.ts,AgentBadge.test.tsx}` | T3 | N |
| `client/src/components/showcase/Showcase.tsx` | T3 | M |
| `MA/helpers.ts`, `MA/helpers.test.ts`, `MA/conflicts.ts`, `MA/conflicts.test.ts` | T4 | N |
| `client/src/lib/hooks/agents.ts`, `client/src/lib/hooks/reviews.ts` | T5 | M |
| `client/src/lib/hooks/reviews.test.tsx` | T5 | N |
| `RES/_components/AgentColumnCard/{AgentColumnCard.tsx,index.ts,styles.ts,AgentColumnCard.test.tsx}`, `RES/_components/AgentColumnCard/_components/FindingRow/{FindingRow.tsx,index.ts}` | T6 | N |
| `RES/_components/ConflictsSection/{ConflictsSection.tsx,index.ts,styles.ts,constants.ts,ConflictsSection.test.tsx}`, `RES/_components/ConflictsSection/_components/ConflictCard/{ConflictCard.tsx,index.ts}` | T7 | N |
| `RES/_components/TabsView/{TabsView.tsx,index.ts,styles.ts,TabsView.test.tsx}` | T8 | N |
| `MA/_components/RunConfig/{RunConfig.tsx,index.ts,styles.ts,RunConfig.test.tsx}`, `MA/_components/RunConfig/_components/AgentPickCard/{AgentPickCard.tsx,index.ts,styles.ts}` | T9 | N |
| `RES/{MultiAgentResults.tsx,index.ts,styles.ts,MultiAgentResults.test.tsx}`, `RES/hooks/useResultsData.ts`, `RES/_components/ResultsHeader/{ResultsHeader.tsx,index.ts,styles.ts}` | T10 | N |
| `client/src/vendor/ui/nav.ts` | T11 | M (one NAV item) |
| `PRD/RunReviewDropdown/RunReviewDropdown.tsx`, `RunReviewDropdown.test.tsx` | T11 | M |
| `client/src/components/app-shell/helpers.test.ts` | T11 | N |
| `MA/page.tsx` | T12 | N |
| `MA/_components/MultiAgentView/{MultiAgentView.tsx,index.ts,styles.ts,MultiAgentView.test.tsx}`, `MA/_components/MultiAgentView/hooks/useMultiAgentRun.ts` | T12 | N |
| `client/README.md` (UI route map) | T12 | M |

## Tasks

### T0 [W0] [frontend] Client contracts: types mirror, URL state, route types/constants, i18n
- **Status:** done
- **Files (only these):** `client/src/lib/types.ts`, `client/messages/en/runs.json`, `client/messages/en/prReview.json`, `client/src/lib/multi-agent-url.ts`, `client/src/lib/multi-agent-url.test.ts`, `MA/types.ts`, `MA/constants.ts`
- **Depends on:** —
- **Produces:** C2, C3, C7 exactly as written.
- **Insights:**
  - `2026-11-05 — /pr-self-review blocks ANY edit in src/vendor/shared/** … → API types missing from @devdigest/shared go into src/lib/types.ts as local mirrors of the server module type (src/lib/types.ts:67 → SkillImportPreview; mirrors server/src/modules/skills/domain.ts).`
  - `2026-11-06 — @devdigest/shared already has multi-agent types (MultiAgentRun, AgentColumn, Conflict, ConflictTake with verdict 'ignored') but NO server route implements … the "Multi-Agent Review" strings in messages/en/runs.json (page.meta "fan-out via p-queue") are also pre-written → reuse the types as-is …, rewrite misleading copy (src/vendor/shared/contracts/observability.ts:66 → Conflict, :75 → MultiAgentRun).`
  - `2026-11-05 — messages/en/prReview.json repeats key names across namespaces … → anchor on the namespace's unique neighbour key and verify with node -e "console.log(require('./messages/en/prReview.json').list.findings)" (messages/en/prReview.json:61, :107 → filesCount).`
- **Skill focus:** typescript-expert (discriminated unions `StartState`/`ColumnState`, no `any`); frontend-ui-architecture (§3: URL helper in `src/lib/` because two routes use it; view types in route `types.ts`).
- **Steps:**
  1. Append the C2 mirror to `types.ts`, using the same comment style as `SkillImportPreview` (mirror + TODO reconcile).
  2. Write `multi-agent-url.ts` (pure, no React). Tests: parse defaults; `pr` non-numeric/negative → null; `agents` absent vs `agents=` vs `a,,b,a` → `null` / `[]` / `["a","b"]`; phase/view only accept the exact values; `multiAgentHref` round-trips and omits the defaults.
  3. Write `MA/constants.ts` and `MA/types.ts` exactly as C3. Use `import type` only.
  4. Edit `runs.json` / `prReview.json` per C7. Insert `compareAgents` inside `runReview` (anchor on `"configureAgents"`). Verify both files with `node -e "const m=require('./messages/en/runs.json');console.log(m.page.meta,m.config.run,m.conflicts.empty)"` and `node -e "console.log(require('./messages/en/prReview.json').runReview.compareAgents)"`.
- **Acceptance criteria:**
  - [ ] C2/C3 compile and are exported exactly as written; no file under `src/vendor/**` changed.
  - [ ] `runs.page.meta` contains neither "p-queue" nor "worktree"; all C7 keys present; JSON valid.
  - [ ] `multi-agent-url.test.ts` covers the cases in step 2.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run multi-agent-url` → all pass

### T1 [W1] [backend] `GET /agents/run-estimates`
- **Status:** done
- **Files (only these):** `server/src/modules/agents/domain.ts`, `server/src/modules/agents/constants.ts`, `server/src/modules/agents/repository.ts`, `server/src/modules/agents/service.ts`, `server/src/modules/agents/routes.ts`, `server/test/agents-run-estimates.test.ts`, `server/test/agents-run-estimates.it.test.ts`, `server/README.md`
- **Depends on:** —
- **Produces:** C1. `AgentsRepository.recentDoneRunSamples(workspaceId: string, perAgent: number): Promise<RunEstimateSample[]>`; `AgentsService.runEstimates(workspaceId: string): Promise<AgentRunEstimates>`.
- **Insights:**
  - `2026-11-04 — There is no base-repository/workspace guard; scoping is manual per query → always add eq(t.x.workspaceId, workspaceId) from getContext (src/modules/_shared/context.ts:14 → getContext).`
  - `2026-11-04 — ReviewService builds new ReviewRepository(container.db) instead of container.reviewRepo → can't be swapped via overrides; prefer the container getter in new code (src/modules/reviews/service.ts:34).` (`AgentsService` has the same legacy pattern at `src/modules/agents/service.ts:56`; add the method to it and don't refactor the constructor in this task.)
  - `2026-11-05 — Correction: layer rules moved to .dependency-cruiser.cjs and the check is now node scripts/check-architecture.mjs …; legacy violations frozen in architecture-baseline.json, which may only shrink → … never --update to absorb a new one (scripts/check-architecture.mjs → keyOf).`
  - `2026-11-05 — /pr-self-review marks ANY edit under */src/vendor/shared/** as a NON-waivable critical … → put new API DTO types in the module (server: src/modules/skills/domain.ts:60 → SkillImportPreview; client mirror in client/src/lib/types.ts).`
  - `2026-11-06 — vendor/shared contracts/observability.ts defines MultiAgentRun / AgentColumn / Conflict / AgentStats … but NO module implements those routes; there is also no per-agent run-history read … → a new read (e.g. run estimates) gets a module-local DTO, not these contracts edited (src/vendor/shared/contracts/observability.ts:75 → MultiAgentRun).`
  - `2026-11-05 — Integration tests intermittently skip (Docker not available) or fail when the full suite runs in parallel: dockerAvailable() times out under load (test/helpers/pg.ts) …` → run the `.it.test.ts` file on its own.
- **Skill focus:** onion-architecture rules 1, 2, 5 (thin route, Drizzle only in repository, pure `aggregateRunEstimates` in `domain.ts` without zod); security A01 (workspace filter on `agent_runs` AND the joined `agents`); drizzle (one query with a window function, no N+1 per agent).
- **Steps:**
  1. `domain.ts` per C1 (pure TS). `ESTIMATE_SAMPLE_SIZE` goes in `constants.ts`.
  2. `recentDoneRunSamples`: a single query over `agent_runs` inner-joined to `agents` on `agents.id = agent_runs.agent_id AND agents.workspace_id = $ws`, filtered by `agent_runs.workspace_id = $ws`, `status = 'done'` and `duration_ms IS NOT NULL`. Rank with `row_number() over (partition by agent_id order by ran_at desc, id desc)` and keep `rn ≤ perAgent`. Map to `RunEstimateSample` inside the repository (no `$inferSelect` leaks).
  3. `AgentsService.runEstimates` = `{ estimates: aggregateRunEstimates(await repo.recentDoneRunSamples(ws, ESTIMATE_SAMPLE_SIZE)) }`.
  4. Route `app.get('/agents/run-estimates', { schema: { response: { 200: RunEstimatesResponse } } }, …)` → `getContext` → service. Declare it above `/agents/:id`. find-my-way prefers static segments anyway, and the test proves it. Add it to the route list comment.
  5. `server/README.md` API map: `agents["agents<br/>/agents · /agents/:id · /agents/run-estimates"]`.
  6. Tests. `agents-run-estimates.test.ts` (pure): empty input → `[]`; mixed null costs average only the non-null ones; all-null → `null`; rounding (`[1000, 1001]` → 1001; `[1,2]` → 2 per `Math.round`); sorted by agent_id. `agents-run-estimates.it.test.ts` (pattern `test/agents-versions.it.test.ts`, insert `t.agentRuns` rows directly with explicit `ranAt`): 7 done runs → `sample_size 5`, averages from the 5 newest only; failed/cancelled/running ignored, and an agent with only those is omitted; all-null cost → `null`; a second workspace's agent + runs never appear; `GET /agents/run-estimates` → 200 `{estimates}`; `GET /agents/<seeded uuid>` still → 200 agent.
- **Acceptance criteria:**
  - [ ] Server spec AC 1–8 hold.
  - [ ] `domain.ts` imports nothing at runtime; route has no Drizzle/db import; no new architecture violation.
  - [ ] No file under `server/src/vendor/shared/` or `server/src/db/migrations/` changed.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/agents-run-estimates.test.ts` → all pass
  - `cd server && node node_modules/vitest/vitest.mjs run test/agents-run-estimates.it.test.ts` → all pass (Docker; a "skipping" warning = not verified, report it)
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T2 [W1] [frontend] Promote FindingCard and RunTraceDrawer to `src/components/`
- **Status:** done
- **Files (only these):** the 6 FindingCard files and 18 RunTraceDrawer files listed in the ownership map (old path deleted, new path created), `PRD/FindingsPanel/FindingsPanel.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- **Depends on:** —
- **Produces:** `@/components/finding-card` → `{ FindingCard, default }`; `@/components/run-trace-drawer` → `{ RunTraceDrawer, default, type RunTraceDrawerProps }` (same public API as today).
- **Insights:**
  - `2026-11-04 — To vary data a vi.mock-ed hook returns per test, never mutate the module-level fixture … → hook reads a let current = FIXTURE, a test assigns a spread copy, afterEach resets it; verify with vitest run --sequence.shuffle (src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:24 → currentTrace).` Keep that pattern when moving the test.
- **Skill focus:** frontend-ui-architecture §3 (move tests with the code, update every import, no re-export shim left behind).
- **Steps:**
  1. `git mv` both folders to `client/src/components/finding-card/` and `client/src/components/run-trace-drawer/`, keeping file names and inner `_components/` structure.
  2. Fix the paths that break: `FindingCard.tsx` imports `githubBlobUrl` from `@/lib/github-urls`. The tests import messages via the new relative depth (`../../../messages/en/...`). In `RunTraceDrawer.test.tsx`, `vi.mock("@/lib/hooks/trace")` / `vi.mock("@/lib/hooks/reviews")` must match the component's own `@/` imports.
  3. Update consumers: `FindingsPanel.tsx` → `import { FindingCard } from "@/components/finding-card"`; `pulls/[number]/page.tsx` → `import RunTraceDrawer from "@/components/run-trace-drawer"`. Don't change any behavior or props.
  4. Don't add either to `/showcase`: both call `useTranslations`, and the smoke Gallery has no intl provider (see T3 insight). They are promoted, not new.
- **Acceptance criteria:**
  - [ ] Client AC 26 (structure part): Grep `_components/(FindingCard|RunTraceDrawer)` in `client/src` → 0 matches; the old folders no longer exist.
  - [ ] Moved tests pass unchanged in behavior, including under `--sequence.shuffle`.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run finding-card run-trace-drawer FindingsPanel --sequence.shuffle` → all pass

### T3 [W1] [frontend] `AgentBadge` shared component + showcase
- **Status:** done
- **Files (only these):** `client/src/components/agent-badge/AgentBadge.tsx`, `index.ts`, `styles.ts`, `helpers.ts`, `AgentBadge.test.tsx`, `client/src/components/showcase/Showcase.tsx`
- **Depends on:** —
- **Produces:** C6 `[T3]` (`AgentBadge`, `agentColorVar`, `agentTint` from `index.ts`, the only entry point).
- **Insights:**
  - `2026-11-04 — Gallery (src/components/showcase/Showcase.tsx) is rendered by src/test/smoke.test.tsx with NO NextIntlClientProvider → components added to /showcase must not call useTranslations; take translated strings as props (src/test/smoke.test.tsx:4 → Gallery; example: src/components/run-cost-badge/RunCostBadge.tsx:21).`
  - `2026-11-05 — Categorical chart colors live in --viz-1..6 (styles.css, dark + light steps …); never reuse status colors (--crit/--warn/--ok) for series.`
- **Skill focus:** frontend-ui-architecture §5 (folder shape); no hex colors; react-testing-library (query by role/name).
- **Steps:**
  1. `helpers.ts`: `agentColorVar`, `agentTint`. Clamp colorIndex into 1..6.
  2. `AgentBadge`: rounded square, `Icon.Cpu`. Props per C6.
  3. Showcase: add a `Group title="Agent badge"` with six badges (`colorIndex` 1..6, one with `label`).
  4. Test: `label` gives `getByRole("img", { name })`; `agentColorVar(3)` → `"var(--viz-3)"`; `agentTint` uses `color-mix(… 12% …)`.
- **Acceptance criteria:**
  - [ ] Client AC 25 (badge part: `var(--viz-N)`, no hex) and AC 28 (`AgentBadge` in Gallery; smoke test passes).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run agent-badge smoke` → all pass

### T4 [W1] [frontend] Route pure logic: columns, totals, estimates, colors, conflicts
- **Status:** done
- **Files (only these):** `MA/helpers.ts`, `MA/helpers.test.ts`, `MA/conflicts.ts`, `MA/conflicts.test.ts`
- **Depends on:** T0
- **Produces:** C4 exactly.
- **Insights:**
  - `2026-11-04 — Severity in src/vendor/ui/primitives/tokens.ts includes INFO, but the Zod contract (@devdigest/shared findings) has only CRITICAL/WARNING/SUGGESTION → don't assume UI tokens match the contract (src/vendor/ui/primitives/tokens.ts:3 → Severity).` Rank with `SEVERITY_RANK` from C3 (contract severities).
  - The 2026-11-06 multi-agent-types entry (see T0): build `Conflict`/`ConflictTake` values, `import type` only.
- **Skill focus:** react-best-practices / frontend-ui-architecture §6 (pure TS, no React imports); typescript-expert (exhaustive `switch` on `ColumnState.kind` / run status).
- **Steps:**
  1. Implement C4. `buildColumns` and the conflict functions are pure and don't depend on input order.
  2. `helpers.test.ts`:
     - `agentColorIndex` is the same for shuffled lists and unique for ≤6 agents (AC 25);
     - `toSelectedAgents` drops unknown ids, uses the default selection for `null`, caps at 10;
     - `latestRunPerAgent` picks the newer of 2 runs of one agent regardless of order (AC 12);
     - `buildColumns` covers every start-state / run-status branch, including done-without-review → running and started-run-not-listed → starting;
     - `runTotals` (max wall over finished runs; cost sum; `null` when every cost is null, AC 15);
     - `aggregateEstimate` (max time, sum cost, only agents with estimates, `null` when none, AC 9);
     - `scoreTone` boundaries 75/50.
  3. `conflicts.test.ts` (AC 20–23):
     - overlap forms one location; adjacent ranges and different files don't; A∩B + B∩C merge transitively;
     - "did not flag" → conflict; differing severities → conflict; equal severities from all counted agents → not a conflict;
     - only `done` columns count; failed/cancelled/running excluded (AC 14); <2 counted → `[]`;
     - line = min start_line; title = highest-severity finding; takes in column order with `"ignored"` for non-flaggers;
     - `conflictFindingIds` returns exactly the findings inside conflicting locations.
- **Acceptance criteria:**
  - [ ] Every case listed in steps 2–3 is a passing test.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run multi-agent` → all pass (also picks up T0's `multi-agent-url.test.ts`)

### T5 [W2] [frontend] Data hooks: estimates query + parallel run mutation
- **Status:** done
- **Files (only these):** `client/src/lib/hooks/agents.ts`, `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/reviews.test.tsx`
- **Depends on:** T0
- **Produces:** C5 exactly (re-exported automatically by `src/lib/hooks/index.ts`, no edit there).
- **Insights:**
  - `2026-11-05 — CORRECTION of 2026-11-05 Toggle entry: MutationCache.onError in providers already toasts EVERY failed mutation, so a call-site onError toast showed two identical toasts → a hook whose callers all show their own contextual error sets meta: OWN_ERROR_TOAST (global toast skipped); without it, don't add a call-site toast (src/lib/providers.tsx:39 → mutationCache onError; src/lib/error-message.ts:13 → OWN_ERROR_TOAST).` `useRunReviewsParallel` resolves (allSettled), so per-agent failures never reach the global toast. Don't add a call-site toast.
- **Skill focus:** react-best-practices (data fetching only in hooks); query keys `[kebab, id]`, invalidate the exact strings `"pr-runs"`, `"pr-active-runs"`, `"reviews"`.
- **Steps:**
  1. Add both hooks per C5. Don't change `useRunReview`; the PR page keeps using it.
  2. `reviews.test.tsx` (pattern `agents.test.tsx`: `vi.mock("../api")`, real `createQueryClient()`, `renderHook`):
     - 3 agent ids → `api.post` called 3 times with `{ agentId }` each, while all 3 promises are still unresolved (AC 10);
     - one rejects with a 429 `ApiError` → its entry is `ok:false` with the message, the others `ok:true` with `run_id` (AC 11);
     - after settle, the 3 keys are invalidated (spy on `invalidateQueries`).
- **Acceptance criteria:**
  - [ ] Client AC 10 (request side) and AC 11 (per-agent failure data) proven by `reviews.test.tsx`.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run reviews.test agents.test` → all pass

### T6 [W2] [frontend] `AgentColumnCard` (one agent's column)
- **Status:** done
- **Files (only these):** `RES/_components/AgentColumnCard/{AgentColumnCard.tsx,index.ts,styles.ts,AgentColumnCard.test.tsx}`, `RES/_components/AgentColumnCard/_components/FindingRow/{FindingRow.tsx,index.ts}`
- **Depends on:** T0, T3, T4
- **Produces:** C6 `[T6]`.
- **Insights:** `2026-11-04 — vi.mock fixture mutation` entry (see T2): never mutate shared fixtures between tests.
- **Skill focus:** react-best-practices (`.map()` body = `FindingRow` component, stable `key={f.id}`, `count > 0 &&` not `count &&`); i18n for every string.
- **Steps:**
  1. Root `role="listitem"` with a 2px top border `agentColorVar(colorIndex)`. The header shows `AgentBadge`, name, and `column.duration` + `RunCostBadge variant="compact"`. A `CircularScore` appears only when done.
  2. Body by `state.kind`:
     - `starting` → `Skeleton` + `column.starting`;
     - `running` → spinner + `column.running`;
     - `done` → `FindingRow` list (`SeverityBadge compact`, title, mono `file:start_line`) or `column.noFindings`;
     - `failed`/`cancelled` → label + `run.error`, no score;
     - `failed_to_start` → `column.failedToStart` + error + `Button` `column.retry` → `onRetry(agent.id)`.
  3. Footer: `column.findingsCount` (total). When `filtered`, show `column.filteredCount {shown,total}` instead. `runs.viewTrace` button → `onViewTrace(run.run_id)` for done/failed/cancelled.
  4. Test (intl provider with `runs` messages): done renders findings + score + "View trace" calls back with run_id; failed shows error and no score (AC 14); failed_to_start shows "Failed to start", the message, and Retry calls `onRetry` with the agent id (AC 11); filtered footer reads "1 of 3 findings" (AC 24).
- **Acceptance criteria:**
  - [ ] Column part of client AC 11, 14, 24; no literal strings, no hex.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run AgentColumnCard` → all pass

### T7 [W2] [frontend] `ConflictsSection` ("Where agents disagree")
- **Status:** done
- **Files (only these):** `RES/_components/ConflictsSection/{ConflictsSection.tsx,index.ts,styles.ts,constants.ts,ConflictsSection.test.tsx}`, `RES/_components/ConflictsSection/_components/ConflictCard/{ConflictCard.tsx,index.ts}`
- **Depends on:** T0, T3, T4
- **Produces:** C6 `[T7]`.
- **Insights:**
  - `2026-11-05 — Kit Checkbox is a <button role="checkbox"> inside a <label> and Toggle is a role="switch" button with NO label prop → in RTL query getByRole('checkbox') scoped within(row) / getByRole('switch'); give a Toggle an accessible hint via a wrapping title (src/vendor/ui/kit/Checkbox.tsx; …/SkillCard.tsx:49 → Toggle).` (The kit `Toggle` now has a `label` prop → pass `label={t("conflicts.onlyConflicts")}`.)
  - `2026-11-04 — SeverityBadge labels ("Critical", "Warning", …) come from the hard-coded English SEV map …, not next-intl (src/vendor/ui/primitives/tokens.ts:6 → SEV).` Cell labels use `runs.severity.*` instead.
- **Skill focus:** react-testing-library (`getByRole("switch", { name: "Show only conflicts" })`); presentational only (no hooks except `useTranslations`).
- **Steps:**
  1. Section title `conflicts.title`. Render the `Toggle` (`on`/`onChange` = props, `label` = `conflicts.onlyConflicts`) and a visible label, only when `countedCount ≥ 2`.
  2. States: `countedCount < 2` → `conflicts.needTwo`; 0 conflicts → `conflicts.empty`; else one `ConflictCard` per conflict (`key = file:line:index`).
  3. `ConflictCard`: header mono `file:line` + title. Then one cell per take: `AgentBadge` (colorIndex looked up in `agents` by `agent_id`), persona, a severity dot (`constants.ts` `SEV_DOT_COLOR`: CRITICAL `var(--crit)`, WARNING `var(--warn)`, SUGGESTION `var(--sugg)`) + `runs.severity.*` label, or muted `conflicts.didNotFlag`. Note = `take.note` or `conflicts.noNote` for ignored.
  4. Test: two-conflict fixture renders `file:line`, title, a cell per agent with "did not flag"; empty and need-two states; toggling the switch calls `onToggleOnlyConflicts(true)`.
- **Acceptance criteria:**
  - [ ] Rendering part of client AC 22, 23, 24 (toggle).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run ConflictsSection` → all pass

### T8 [W2] [frontend] `TabsView` (one agent at a time)
- **Status:** done
- **Files (only these):** `RES/_components/TabsView/{TabsView.tsx,index.ts,styles.ts,TabsView.test.tsx}`
- **Depends on:** T0, T2, T3, T4
- **Produces:** C6 `[T8]`.
- **Insights:** `2026-11-04 — vi.mock fixture mutation` entry (see T2).
- **Skill focus:** react-best-practices (selected tab = local `useState`, default `columns[0].agent.id`; derive the active column during render, falling back to the first when the id disappears; no effect); a11y (`role="tablist"` `aria-label={t("tabs.label")}`, `role="tab"` + `aria-selected`).
- **Steps:**
  1. Own tablist (kit `Tabs` label is string-only). Each tab shows `AgentBadge`, name, and the score colored by `scoreTone` → `var(--ok|--warn|--crit)` (only for done).
  2. Active panel. For done: summary card (`CircularScore`, name, `review.summary ?? tabs.noSummary`, `runs.viewTrace`, `column.duration` + `RunCostBadge`), then findings (`onlyFindingIds` filter when non-null) as `FindingCard` from `@/components/finding-card`, with `onAction` wired through `useFindingAction()` `{ findingId, action, prId }`. Other states: same texts as T6, plus Retry for `failed_to_start`.
  3. Test (mock `@/lib/hooks/reviews` `useFindingAction`; intl with `runs` + `prReview`): one tab per column; clicking the 2nd tab shows its summary and its findings as FindingCards (AC 17); `onlyFindingIds` hides non-conflict findings (AC 24).
- **Acceptance criteria:**
  - [ ] Client AC 17; tabs part of AC 24.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run TabsView` → all pass

### T9 [W3] [frontend] `RunConfig` (phase "config")
- **Status:** done
- **Files (only these):** `MA/_components/RunConfig/{RunConfig.tsx,index.ts,styles.ts,RunConfig.test.tsx}`, `MA/_components/RunConfig/_components/AgentPickCard/{AgentPickCard.tsx,index.ts,styles.ts}`
- **Depends on:** T0, T3, T4, T5
- **Produces:** C6 `[T9]`. `AgentPickCard` props: `{ agent: Agent; colorIndex: number; checked: boolean; disabled: boolean; estimate: AgentRunEstimate | undefined; onToggle: (checked: boolean) => void }`.
- **Insights:** the Checkbox/Toggle RTL entry (see T7). This task uses a native `<input type="checkbox">`, because the kit `Checkbox` has no `disabled` prop → query `getByRole("checkbox", { name: <agent name> })`.
- **Skill focus:** react-best-practices (derive button label/disabled/total from props, don't store them); frontend-ui-architecture (hooks `usePulls`, `useAgents`, `useAgentRunEstimates` called here; math in `MA/helpers.ts`).
- **Steps:**
  1. Header `config.title` + `config.intro`. Step 1 is a `Dropdown` of `usePulls(repoId)` items (`page.prItem`), and its trigger shows the selected PR or `page.selectPr`. Picking calls `onSelectPr(number)`.
  2. Step 2: with no PR → dashed empty block `config.pickPrFirst`. With no agents at all → `EmptyState` `page.noAgents.*` with CTA → `router.push("/agents")`. Otherwise:
     - one `AgentPickCard` per `useAgents()` agent, including disabled agents (hint `config.disabled`);
     - each card: checkbox labelled with the agent name, badge, model, description clamped to 2 lines (CSS line-clamp), and `config.estimate` (`formatSeconds`, `formatCost`) only when an estimate exists;
     - the Select all / Clear all button selects the first `MAX_AGENTS_PER_RUN` agents, and its label flips when all selectable agents are selected.
  3. Cap: when `selectedIds.length === MAX_AGENTS_PER_RUN`, unchecked cards are disabled and show `config.capHint {max}`.
  4. Run bar: button label `config.run {count}`. It is disabled when `prNumber === null`, `count === 0` or `isStarting`. `onRun` on click. The total `config.totalEstimate` comes from `aggregateEstimate`, hidden when `null`.
  5. Test (vi.mock `@/lib/hooks/core` `usePulls`, `@/lib/hooks/agents` `useAgents` + `useAgentRunEstimates`, `next/navigation`):
     - no PR → empty state + disabled button (AC 3);
     - 3 agents → 3 cards, no design persona names (AC 5);
     - Select all / Clear all flips (AC 6);
     - labels for 0/1/3 (AC 7);
     - 10 selected → unchecked card disabled + cap hint (AC 8, fixture with 11 agents);
     - estimate shown for the agent with history, absent for the other, total = max/sum, hidden when none (AC 9).
- **Acceptance criteria:**
  - [ ] Client AC 3, 5, 6, 7, 8, 9.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run RunConfig` → all pass

### T10 [W3] [frontend] `MultiAgentResults` (phase "results")
- **Status:** done
- **Files (only these):** `RES/{MultiAgentResults.tsx,index.ts,styles.ts,MultiAgentResults.test.tsx}`, `RES/hooks/useResultsData.ts`, `RES/_components/ResultsHeader/{ResultsHeader.tsx,index.ts,styles.ts}`
- **Depends on:** T0, T2, T4, T6, T7, T8
- **Produces:** C6 `[T10]`. `useResultsData(prId: string, agents: readonly SelectedAgent[], startStates: StartStates): { columns: AgentColumnView[]; isLoading: boolean; hasAnyRun: boolean }`. `ResultsHeader` props: `{ pr: ResolvedPr; totals: RunTotals; view: MultiAgentViewMode; onChangeView: (v: MultiAgentViewMode) => void; onConfigure: () => void }`.
- **Insights:**
  - `2026-11-04 — SSE uses new EventSource(API_BASE + '/runs/:id/events') in hooks/reviews.ts — the one sanctioned bypass of api.ts (src/lib/hooks/reviews.ts:181 → new EventSource).` Use `useRunEvents`, never a new EventSource.
  - `2026-11-05 — Modals rendered at the top of a view come BEFORE the page in the DOM, so getAllByRole(...)[last] picks the page button; scope with within(getByRole("dialog")) (ConventionsView.test.tsx).` Same for the trace `Drawer`.
- **Skill focus:** react-best-practices (useEffect only for the SSE-settle sync, same `wasRunning` ref pattern as `PRD/RunStatus/RunStatus.tsx:21-26`; conflicts/visible findings derived during render); security (render LLM text only as React text/`Markdown`, never `dangerouslySetInnerHTML`).
- **Steps:**
  1. `useResultsData` (the 4 hooks work together → `hooks/`):
     - `usePrRuns(prId)` + `usePrReviews(prId)` → `buildColumns`;
     - `useRunEvents(ids of columns in kind "running")`;
     - when its `running` flag goes true→false, invalidate `["pr-runs", prId]`, `["pr-active-runs", prId]`, `["reviews", prId]` via `useQueryClient`;
     - `hasAnyRun` = some column is not `starting`, or some start state exists.
  2. `ResultsHeader`: Configure run (`results.configure`) → `onConfigure`; title `page.title`; `results.subtitle {count}`; Columns|Tabs toggle (two `Button kind="tertiary"` with `active` + `aria-pressed`, group `aria-label={t("page.view.label")}`); meta row: mono `#N` + title, then `page.meta {count, duration: formatSeconds(wall_ms)}` (or `page.metaRunning` when `wall_ms` is null) + `RunCostBadge variant="compact" costUsd={totals.cost_usd}`.
  3. `MultiAgentResults`:
     - local state `onlyConflicts` (false) and `traceRunId` (null);
     - derived `conflicts = findConflicts(columns)`, `ids = conflictFindingIds(columns)`, `countedCount = countedColumns(columns).length`;
     - Columns view: a `role="list"` grid with `s.grid(n)` = `gridTemplateColumns: repeat(min(n, MAX_GRID_COLUMNS), minmax(COLUMN_MIN_WIDTH_PX px, 1fr))`, `gridAutoFlow: "column"`, `gridAutoColumns: minmax(220px, 1fr)`, `overflowX: "auto"`, holding `AgentColumnCard`s (`visibleFindings` filtered by `ids` when `onlyConflicts`);
     - Tabs view: `TabsView` with `onlyFindingIds = onlyConflicts ? ids : null`;
     - `ConflictsSection` under both views;
     - `RunTraceDrawer` from `@/components/run-trace-drawer` for `traceRunId` (agentName, `prNumber`, findings of that column);
     - `!isLoading && !hasAnyRun` → `EmptyState` `page.noRun.*` with CTA → `onConfigure`.
  4. Test (vi.mock `@/lib/hooks/reviews` `usePrRuns`/`usePrReviews`/`useRunEvents`/`useFindingAction` with `let current` fixtures, `@/lib/hooks/trace` `useRunTrace`; intl `runs` + `prReview`):
     - newer of 2 runs of agent A drives the score (AC 12);
     - rerender with the run `done` + its review → column turns done with no navigation (AC 13);
     - failed column excluded from conflicts (AC 14);
     - meta text "3 agents · 9.4s total", cost "—" when all null, and no "worktree"/"p-queue" in the document (AC 15);
     - 7 agents → 7 `listitem`s in a list with `overflowX: auto` and `gridAutoFlow: column`; 3 agents → `gridTemplateColumns` `repeat(3, …)` (AC 16);
     - View trace opens the drawer for that run_id (`within(getByRole("dialog"))`, AC 18);
     - "Show only conflicts" on hides non-conflict findings in columns and the footer reads "x of y findings", off restores them (AC 24);
     - no runs → EmptyState with "Configure run".
- **Acceptance criteria:**
  - [ ] Client AC 12, 13, 14, 15, 16, 18, 24 (and the 22 empty state shown through `ConflictsSection`).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run MultiAgentResults AgentColumnCard ConflictsSection TabsView` → all pass

### T11 [W3] [frontend] Sidebar item + "Compare agents…" entry point
- **Status:** done
- **Files (only these):** `client/src/vendor/ui/nav.ts`, `PRD/RunReviewDropdown/RunReviewDropdown.tsx`, `PRD/RunReviewDropdown/RunReviewDropdown.test.tsx`, `client/src/components/app-shell/helpers.test.ts`
- **Depends on:** T0
- **Produces:** NAV item `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href: "/repos/:repoId/multi-agent" }` in WORKSPACE, directly after `pulls` (no `gKey`). Dropdown item `runReview.compareAgents`.
- **Insights:** none specific. `activeKeyFor` already maps `/multi-agent` (`client/src/components/app-shell/helpers.ts:28`). Don't edit that file.
- **Skill focus:** frontend-ui-architecture §11 (vendored `nav.ts`: one entry, nothing else in `src/vendor/ui`); react-testing-library (user clicks the menu item, assert `router.push`).
- **Steps:**
  1. Add the NAV item.
  2. `RunReviewDropdown`: read `{ repoId, number }` via `useParams` and add the item `{ label: t("runReview.compareAgents"), icon: "Users", onClick: () => router.push(multiAgentHref(repoId, { pr: Number(number) })) }` just before the "Configure agents…" divider. Props are unchanged.
  3. `RunReviewDropdown.test.tsx`: mock `useParams` → `{ repoId: "r1", number: "5" }` and a shared `push` spy; the user opens the menu, clicks "Compare agents…" → `push("/repos/r1/multi-agent?pr=5")` (AC 2). Keep the existing smoke test.
  4. `helpers.test.ts`: `activeKeyFor("/repos/r1/multi-agent") === "multi-agent"`; the WORKSPACE group has the item right after `pulls`; `resolveHref(item.href, "r1") === "/repos/r1/multi-agent"` (AC 1).
- **Acceptance criteria:**
  - [ ] Client AC 1, 2.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run RunReviewDropdown app-shell` → all pass

### T12 [W4] [frontend] `MultiAgentView` + page: URL state, run orchestration, integration
- **Status:** done
- **Files (only these):** `MA/page.tsx`, `MA/_components/MultiAgentView/{MultiAgentView.tsx,index.ts,styles.ts,MultiAgentView.test.tsx}`, `MA/_components/MultiAgentView/hooks/useMultiAgentRun.ts`, `client/README.md`
- **Depends on:** T0–T11 (all client tasks; T1 only for a manual check against a real API)
- **Produces:** route `/repos/[repoId]/multi-agent`; C6 `[T12]` `useMultiAgentRun`.
- **Insights:**
  - `2026-11-05 — Master-detail pages keep selection + tab in the URL (/skills?id&tab, ?new=1) and wrap the page in <Suspense> (useSearchParams on a static route) … (src/app/skills/_components/SkillsLab/SkillsLab.tsx).`
  - The `OWN_ERROR_TOAST` correction (see T5): don't add call-site toasts for run failures; the column shows them.
- **Skill focus:** next-best-practices (`page.tsx` is a **server** component: `async function MultiAgentPage({ params }: { params: Promise<{ repoId: string }> })` → `<Suspense><MultiAgentView repoId={repoId} /></Suspense>`; `'use client'` only on `MultiAgentView`); react-best-practices (selection, PR, phase and view live in the URL and are derived each render; start states are the only local state); security (POST only ids from `useAgents()`; URL ids are filtered, never sent raw).
- **Steps:**
  1. `MultiAgentView({ repoId })`:
     - `parseMultiAgentSearch(useSearchParams())`; `useAgents()`, `usePulls(repoId)`, `useRepoNotFound(repoId)` → `RepoNotFound` inside `AppShell`;
     - crumb `[{ repo full_name, mono, href pulls }, { label: t("page.crumb") }]`;
     - `selected = toSelectedAgents(agents, url.agents)`; `pr: ResolvedPr | null` = the pulls entry with `number === url.pr` and a non-null `id`.
  2. URL writes go through `multiAgentHref`: `router.replace` for PR/agent/view changes, `router.push` for phase changes.
     - Run: push `{ pr, agents: selected ids, phase: "results", view }`, then `start(ids)`.
     - Configure run: push the same state with `phase: "config"` (AC 19).
     - Retry: `start([agentId])`.
  3. Render `MultiAgentResults` when `url.phase === "results" && pr`, else `RunConfig`. A results URL without a resolvable PR shows config.
  4. `useMultiAgentRun(prId)`:
     - state `{ prId, states }`; `start` merges `pending` for the ids, awaits `useRunReviewsParallel(prId).mutateAsync(ids)`, then merges `started{run_id}` / `failed{error}`;
     - returned `startStates` are `{}` when the stored prId ≠ current prId;
     - `isStarting` = any state is `pending`.
  5. `client/README.md` route map: add `MA["/repos/:repoId/multi-agent<br/>Multi-Agent Review"]` with an edge to `API` labelled `GET /agents/run-estimates · /pulls/:id/runs · /reviews<br/>POST /pulls/:id/review ×N`.
  6. `MultiAgentView.test.tsx`. Mocks: `next/navigation` (`useSearchParams` from a `let currentSearch`, push/replace spies), `@/components/app-shell` (children only), `@/lib/repo-context`. `vi.mock("@/lib/api")` routes `api.get` by path to fixtures, and `api.post` returns deferred promises. Real `createQueryClient()` + intl `runs` + `prReview`. Cases:
     - `?pr=5&agents=a,b,zzz&phase=results&view=tabs` → results phase in Tabs view with exactly agents a and b (AC 4);
     - no `?pr` → "Pick a pull request first" and Run disabled (AC 3);
     - config with 3 selected → click Run → 3 `api.post` calls are pending at once, each with `{ agentId }`, and `push` got a URL with `phase=results` (AC 10);
     - reject one with 429 → its column shows "Failed to start" + message, the others render; Retry → exactly one more `api.post` for that agent (AC 11);
     - Configure run → push URL keeps `pr=5&agents=…` with no `phase` (AC 19).
- **Acceptance criteria:**
  - [ ] Client AC 3, 4, 10, 11, 19 end-to-end in the view; AC 26: Grep `pulls/\[number\]/_components` under `client/src/app/repos/[repoId]/multi-agent` → 0 matches.
  - [ ] AC 27: `git diff --stat -- client/src/vendor/shared server/src/vendor/shared server/src/db/migrations` → empty. Grep `#[0-9a-fA-F]{3,6}\b` in the non-test `.ts`/`.tsx` files of `client/src/app/repos/[repoId]/multi-agent` and `client/src/components/agent-badge` → 0 matches.
  - [ ] AC 29: full client suite and typecheck green.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run MultiAgentView` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run` → all pass (AC 29)
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass (cross-package gate)

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T0 | alone | client typecheck + `multi-agent-url` tests green |
| W1 | T1, T2, T3, T4 | in parallel | each task's Verify; client typecheck; server typecheck + unit + architecture check |
| W2 | T5, T6, T7, T8 | in parallel | each task's Verify; client typecheck |
| W3 | T9, T10, T11 | in parallel | each task's Verify; client typecheck |
| W4 | T12 | alone | full client suite + typecheck; server unit suite |

No migration task in any wave. No `reviewer-core` change.

## Acceptance-criteria map

| Spec AC | Task(s) |
|---|---|
| client 1, 2 | T11 |
| client 3 | T9, T12 |
| client 4 | T0 (parse), T4 (`toSelectedAgents`), T12 |
| client 5–9 | T9 (9 math: T4) |
| client 10, 11 | T5, T6 (column), T12 |
| client 12, 13 | T4, T10 |
| client 14 | T4, T6, T10 |
| client 15 | T0 (copy), T4, T10 |
| client 16, 18 | T10 |
| client 17 | T8 |
| client 19 | T12 |
| client 20–23 | T4 (logic), T7 (render) |
| client 24 | T6, T8, T10 |
| client 25 | T4 (`agentColorIndex`), T3 (`var(--viz-N)`) |
| client 26 | T2, T12 |
| client 27 | T0 (i18n), T12 (diff/grep check), all UI tasks |
| client 28 | T3 |
| client 29 | every task's Verify; final T12 |
| server 1–8 | T1 |

## Risks · Review focus

- **Workspace scoping of the estimates query** (T1). It must filter `agent_runs.workspace_id` AND join `agents` in the same workspace. A missed filter leaks other tenants' agents/costs. Proven by the two-workspace `.it.test.ts`.
- **Promotion leftovers** (T2). Watch for stale relative imports, `vi.mock` paths that no longer match the component's imports (the test then passes against the real hook or fails at runtime), and a forgotten re-export or old folder.
- **Stale or stuck columns (Q-g)** (T4, T10, T12). Check that started agents follow their own `run_id`, that done-without-review shows as running, and that the SSE-settle invalidation fires for runs that finished before the page subscribed (`server/src/platform/sse.ts:85-98` replays then ends). Also check that start states don't leak across PRs.
- **Rate-limit path** (T5, T9, T12). Check the 10-agent cap, that a 429 is shown per column with no duplicate global toast, and that Retry re-POSTs exactly one agent. Two runs within one minute can still hit 429 by design (Q-a).
- **i18n and colors** (T0 + every UI task). Look for missing keys (`MISSING_MESSAGE` in tests), literals in JSX, `prReview.json` duplicate-key anchoring, hex colors, and status colors reused for agents.
- **Conflict algorithm** (T4). Check the transitive merge, that only `done` agents count, that the per-agent verdict is its highest severity, and the <2-counted short-circuit. Query performance: `agent_runs` has no `(workspace_id, agent_id, ran_at)` index. That's fine for local-first volumes; adding one is a separate migration decision.

## Open questions

- none
