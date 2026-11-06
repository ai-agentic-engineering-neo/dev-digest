# Multi-Agent Review — client

Server half (only the run-estimate read; see Q-d): [../../server/specs/multi-agent-review.md](../../server/specs/multi-agent-review.md).
Design: `docs/design/devdigest-2/screen_multiagent.jsx` (phases "config" + "results"),
`screenshots/focus-persona-cols.png`, `focus-persona-tabs.png`, sidebar entry in `chrome.jsx`.
The design is inline-style React on `window` globals. Port the layout and states, not the code.

Items marked **(Q-x)** follow the Decisions at the end, which the user accepted on 2026-11-06
(recommended options).

## Goal

As a user I can:
- pick a pull request and a subset of agents and run them on it in parallel;
- compare the agents' scores, findings, time and cost side by side (Columns) or one at a time (Tabs);
- see where the agents disagree, and filter the findings down to only those conflicts;
- open any agent's run trace;
- go back, change the PR or agents, and run again.

## Scope

### Facts this spec relies on (verified 2026-11-06)
- `POST /pulls/:id/review` accepts `{agentId}` or `{all:true}` (`RunRequest`, vendor/shared). It
  returns `{runs:[{run_id, agent_id, agent_name}], reviews}` right away, and the runs continue in
  the background. The route is limited to **10 requests per minute**
  (server/src/modules/reviews/routes.ts:28).
- `{all:true}` runs the agents **one after another** in a single `executeRuns` loop
  (server/src/modules/reviews/run-executor.ts:107). Separate per-agent calls are what actually run
  in parallel.
- `GET /pulls/:id/runs` → `RunSummary[]`, newest first, with `status`, `duration_ms`, `cost_usd`,
  `score`, `findings_count` and `error`. `GET /pulls/:id/reviews` → `ReviewDto[]`, joined to runs
  by `run_id`, with findings that carry `file`, `start_line`, `end_line` and `severity`.
- `@devdigest/shared` already has `Conflict` / `ConflictTake` / `AgentColumn`
  (contracts/observability.ts). There is no server endpoint behind them. This feature uses the
  types as they are and does **not** edit vendor/shared.
- The sidebar key `multi-agent` exists (`src/components/app-shell/helpers.ts:28 → activeKeyFor`),
  but there is no page and no `NAV` item. The i18n namespace `runs` already has `page.*`,
  `column.*`, `conflicts.*` and `tabs.*` strings for this screen.
- Agents have no color or icon field.

### Out of scope (do NOT port from the design)
- The "fan-out via worktrees" text, including the existing `runs.page.meta` string "fan-out via
  p-queue": the meta row says only agents · time · cost.
- The `#482` / "Add rate limiting…" fallbacks: with no PR there is no results phase.
- The hard-coded `PERSONAS` list: agents come from `useAgents()`.
- A server-side "multi-agent run" entity, `POST /pulls/:id/multi-agent-run` and server-computed
  conflicts.
- Changes to `RunRequest`, unless Q-a is answered differently.

### Route and navigation (Q-b)
- Route `/repos/[repoId]/multi-agent` with a thin `page.tsx` (`MultiAgentPage`). The UI lives in
  `_components/MultiAgentView/`, wrapped in `<Suspense>` because it uses `useSearchParams`. An
  unknown `:repoId` shows `RepoNotFound`.
- State lives in the URL: `?pr=<number>&agents=<id>,<id>&phase=results&view=columns|tabs`. With
  `phase` missing (or anything other than `results`) the page shows the config phase.
- Sidebar: WORKSPACE → **Multi-Agent Review** (icon `Users`), under Pull Requests, with href
  `/repos/:repoId/multi-agent`.
- PR detail: `RunReviewDropdown` gets an item **Compare agents…** that opens
  `/repos/:repoId/multi-agent?pr=<number>`, the config phase with that PR already picked.

### Phase "config" — `_components/RunConfig`
- Title "Run a Multi-Agent Review" and an intro line with no mention of worktrees.
- **Step 1, Pull request:** a `Dropdown` of the repo's PRs (`usePulls(repoId)`), each shown as
  `#N · title`. Picking one sets `?pr=`.
- **Step 2, Agents to run:** before a PR is picked, a dashed empty state ("Pick a pull request
  first"). After that, one `AgentPickCard` per agent from `useAgents()`, including disabled agents
  with a "disabled" hint, because the existing per-agent run ignores `enabled`.
  - Each card shows a checkbox, the agent badge (color + icon, see Q-e), name, model, description
    (clamped to 2 lines) and an estimate `≈ 8.2s · $0.06`. If the agent has no history, it shows
    no estimate (Q-d).
  - **Select all** / **Clear all** toggles every agent.
  - First-time default selection: all **enabled** agents (at most `MAX_AGENTS_PER_RUN`).
- **Run bar:** the primary button reads "Select agents" (disabled) when nothing is selected, "Run
  1 agent" for one, and "Run multi-agent review (N)" for more. It is disabled when there is no PR
  or no agent. Next to it is the total estimate: max of the selected averages for time, sum for
  cost, counting only agents that have an estimate. It is hidden when none of them has one.
- `MAX_AGENTS_PER_RUN = 10` (the route's rate limit). Once 10 agents are selected, unchecked cards
  are disabled, with a hint saying why (Q-a).
- **Run:** fires one `POST /pulls/:id/review {agentId}` per selected agent **in parallel**
  (`Promise.allSettled`). It then invalidates `["pr-runs", prId]`, `["pr-active-runs", prId]` and
  `["reviews", prId]` and moves to `phase=results`. An agent whose POST failed (for example a 429)
  is not dropped: its column shows "Failed to start" and the error text.

### Phase "results" — `_components/MultiAgentResults`
- **Header:**
  - **Configure run** goes back to `phase=config` and keeps `pr` and `agents`;
  - title "Multi-Agent Review" and "N selected agents · parallel";
  - a Columns | Tabs toggle (`view=`).
- **Meta row:** `#N` and the PR title, then `N agents · <wall>s total · <cost>`.
  - wall = max of `duration_ms` over finished runs;
  - cost = sum of `cost_usd`, shown with `RunCostBadge`, and "—" when every value is null.
- **One column per selected agent.** Its data is that agent's **latest run on this PR** (newest
  `RunSummary` with that `agent_id`) and the review whose `run_id` matches. Column states:
  - `starting`: the POST is still in flight, or there is no run yet. Skeleton.
  - `running`: spinner and "Running…". It turns into `done` without a reload, through the existing
    SSE and polling refetch; no new mechanism.
  - `done`: `CircularScore` (score), `duration · cost`, findings, a "N findings" footer and
    **View trace**.
  - `failed` / `cancelled`: the error text and View trace. No score.
  - `failed to start`: the POST error and a **Retry** button that re-POSTs only that agent.
- **Columns view (default, Q-f):**
  - Grid columns `repeat(min(n,5), minmax(220px,1fr))`; with more than 5 agents the grid scrolls
    horizontally inside its own container, never the page.
  - Each column has a 2px top border in the agent's color and a header with badge, name,
    `time · cost` and score.
  - The body is a compact finding list (severity icon, title, `file:start_line`), sorted by
    severity and then by file and line.
  - "No findings" when a done review has none.
- **Tabs view:**
  - One tab per agent (badge, name, score colored ok/warn/crit at ≥75 / ≥50 / below 50, aligned with the kit `CircularScore`; user decision 2026-11-06).
  - Under the tabs, a summary card (score, name, review summary, View trace, `time · cost`) and
    the agent's findings as the existing `FindingCard`.
  - The selected tab is local state and defaults to the first agent.
- **View trace** opens the existing `RunTraceDrawer` for that column's `run_id`.
- **"Where agents disagree"** (both views, under the agents) — rule in Q-c:
  - One card per conflict: header `file:line` and title, then one cell per **counted** agent with
    the agent name, a severity dot and label (or "did not flag", muted), and a note. For a flagger
    the note is the finding's title; for a non-flagger it is "—".
  - Empty states: "Agents agree on every flagged location" when there are 0 conflicts, and
    "Need at least two finished agents to compare" when fewer than 2 agents are counted.
  - **Show only conflicts** (`Toggle` with an accessible name, local state, off by default): when
    on, the columns and tabs list only findings that belong to a conflict. Each column footer then
    reads "x of y findings".
- **Results without a run:** opening a `phase=results` URL directly shows the latest existing runs
  and runs nothing. If no selected agent has ever run on the PR, an `EmptyState` with **Configure
  run** is shown.

### Agent badge (Q-e) — `src/components/agent-badge/`
- Color is `var(--viz-N)`, where `N = (index of agent.id in the workspace agents sorted by id) % 6
  + 1`. Tints use `color-mix(in srgb, var(--viz-N) 12%, transparent)`, not hard-coded hex. Icon is
  always `Cpu`. It is shared: the config cards, column headers, tabs and conflict cells all use
  it. Added to `/showcase`, with no `useTranslations`.

### Structure (frontend-ui-architecture)
- `FindingCard` and `RunTraceDrawer` live under `pulls/[number]/_components/`, and a sibling route
  may not import them. **Promote** both to `src/components/finding-card/` and
  `src/components/run-trace-drawer/`: move the tests with them, update every import, leave no
  re-export.
- Pure logic goes in helpers with unit tests: `latestRunPerAgent`, `buildColumns`,
  `findConflicts`, `conflictFindingIds`, `agentColorIndex`, `aggregateEstimate`, `runTotals`.
- Hooks: `useRunReviewsParallel` (or reuse `useRunReview` per agent) in `src/lib/hooks/reviews.ts`.
  The estimate hook `useAgentRunEstimates` (Q-d) goes in `src/lib/hooks/agents.ts`. Its DTO is a
  local mirror in `src/lib/types.ts`, not vendor/shared.
- Strings: extend the existing `runs` namespace (`page.*`, `column.*`, `conflicts.*`). Replace the
  `page.meta` text, which mentions "p-queue".

## Acceptance criteria

Navigation and URL
1. The sidebar shows "Multi-Agent Review" (WORKSPACE). On `/repos/:repoId/multi-agent` it is
   active, and its href carries the active repo id.
2. `RunReviewDropdown` has "Compare agents…", which navigates to
   `/repos/:repoId/multi-agent?pr=<number>` (RTL: click → `router.push` called with that URL).
3. With no `?pr`, step 2 shows the "Pick a pull request first" empty state and the Run button is
   disabled.
4. Reloading `?pr=5&agents=a,b&phase=results&view=tabs` restores the results phase, the tabs view
   and agents a and b. Unknown agent ids in `agents` are ignored.

Config
5. With a PR selected, one card renders per agent returned by `useAgents()`. The design's
   `PERSONAS` names do not appear (fixture with 3 agents → 3 cards).
6. Select all checks every agent (up to the cap); Clear all unchecks all. The label flips with the
   state.
7. The button label is "Select agents" (disabled) for 0, "Run 1 agent" for 1 and "Run multi-agent
   review (3)" for 3.
8. With 10 agents selected, unchecked cards are disabled and show the cap hint.
9. An agent with history shows `≈ <avg s>s · $<avg cost>`. An agent with none shows no estimate
   text. The run-bar total is max(time) and sum(cost) over agents that have an estimate, and it is
   hidden when none do.
10. Run sends exactly one `POST /pulls/:prId/review` per selected agent with body `{agentId}`, never
    `{all:true}`. All requests start before any of them resolves (mock: N calls are pending at the
    same time). Then the URL has `phase=results`.
11. If one POST rejects (429), the other columns still render, and that agent's column shows
    "Failed to start" with the error message and Retry. Retry re-POSTs only that agent.

Results
12. Each column uses that agent's newest run for this PR (fixture with 2 runs of agent A → the
    newer score is shown) and the findings of the review with the matching `run_id`.
13. A `running` column becomes `done` after the runs and reviews queries return the finished run,
    with no navigation.
14. A `failed` column shows the run's `error` and no score. Failed, cancelled and running agents are
    excluded from conflicts.
15. The meta row shows the agent count, max `duration_ms` (s, 1 decimal) and the summed cost.
    Cost is "—" when every `cost_usd` is null. The text contains no "worktree" or "p-queue".
16. Columns view with 7 agents: the grid container (not the page) scrolls horizontally. With 3
    agents there are 3 columns.
17. Tabs view renders one tab per agent. Clicking a tab shows that agent's summary and its findings
    as `FindingCard`s.
18. View trace opens `RunTraceDrawer` with that column's `run_id`.
19. Configure run returns to the config phase with the same PR and agents still selected.

Conflicts (`findConflicts` unit tests + RTL)
20. Same file with overlapping line ranges (`a.start ≤ b.end && b.start ≤ a.end`) from two agents
    forms one location. Adjacent but not overlapping ranges, or different files, do not.
    Overlapping groups merge transitively (A∩B, B∩C → one location).
21. A location is a conflict if a counted agent has no finding in it ("did not flag"), or if the
    flagging agents' severities differ. The same severity from every counted agent → not a
    conflict.
22. "Counted" means a selected agent whose latest run is `done`. With fewer than 2 counted agents
    the section shows the "need at least two" empty state.
23. A conflict shows `file:line` (line = min `start_line`), the title of its highest-severity
    finding, and one cell per counted agent in column order.
24. Show only conflicts, when on, hides every finding that belongs to no conflict, in both views,
    and the column footer reads "x of y findings". Off restores the full lists.

Agent badge
25. `agentColorIndex` is the same for the same agent list whatever order the agents arrive in,
    and different for each agent when there are ≤6. Badges use `var(--viz-N)`, and no hex color
    is used in the new components.

Structure and quality
26. `FindingCard` and `RunTraceDrawer` are imported from `src/components/…` by both routes. No file
    imports a sibling route's `_components` (architecture check / grep).
27. No edits under `src/vendor/shared/**`. All user-visible text goes through next-intl (`runs`).
28. `AgentBadge` (and any new shared component) appears in `/showcase`, and the smoke test passes.
29. `tsc --noEmit` and `vitest run` pass in `client/`.

## Decisions (accepted 2026-11-06)

The user accepted every recommended option below. The rejected alternatives are kept for context.

- **Q-a. Running a subset of agents.**
  1. N parallel `POST {agentId}` calls: no contract change, actually parallel (`{all:true}` is
     sequential), and per-agent errors and Retry come for free. On the other hand: N HTTP calls,
     each run loads the diff again, and the 10/min route limit caps a run at 10 agents (and
     back-to-back runs within a minute can get 429s).
  2. `agentIds: string[]` in `RunRequest`: one call and one diff load, but it changes
     vendor/shared (blocked by `/pr-self-review` as a non-waivable critical) and the executor would
     still be sequential unless it is also changed.

  **Recommended: option 1**, `MAX_AGENTS_PER_RUN = 10`, with a 429 shown per column with Retry.
  Raising the route limit is a separate decision.
- **Q-b. Route and entry point.** **Recommended:** `/repos/:repoId/multi-agent` with URL state
  (`pr`, `agents`, `phase`, `view`), a sidebar item under WORKSPACE, and "Compare agents…" in the
  PR page's Run review dropdown that opens the config phase with the PR picked. Alternative: a
  "Compare" tab on the PR page itself. Rejected because the design is a standalone screen with
  its own PR picker.
- **Q-c. Disagreement rule.** **Recommended:**
  - Counted agents are the selected agents whose **latest run on this PR is `done`**.
  - Same file with overlapping `[start_line, end_line]` forms a location, merged transitively.
  - A location is a conflict if ≥1 counted agent did not flag it, or if the flaggers' severities
    differ.
  - Accepted and dismissed findings still count, since they were flagged.

  Category is ignored.
  Follow-up, not in this scope: with many agents almost every location is "≥1 did not flag". If
  that turns out noisy in practice, require ≥2 flaggers for the "did not flag" case.
- **Q-d. Pre-run estimate.** A per-PR average (`/pulls/:id/runs`) needs no API change, but it is
  empty for any PR that hasn't been reviewed yet, which is when the estimate matters.
  **Recommended:** a small read endpoint `GET /agents/run-estimates` that averages each agent's
  last **5** `done` runs across the workspace (server spec), and no estimate for an agent with 0
  runs. If you'd rather avoid server work, the fallback is: hide the estimate unless that agent has
  done runs on this PR.
- **Q-e. Agent color and icon.** **Recommended:** derive it in the client, with no migration.
  - Color `--viz-((index in agents sorted by id) % 6) + 1`: no collisions up to 6 agents. Hashing
    the id instead would collide about 85% of the time with 5 agents.
  - Icon is always `Cpu`.

  Trade-off: creating or deleting an agent can shift the other agents' colors. New DB fields
  (`color`, `icon` + migration + agent editor UI) are a separate feature.
- **Q-f. Default view and more than 5 agents.** **Recommended:**
  - Columns by default whatever the count (it's the screen's main purpose), with `?view=`
    remembering the choice.
  - With more than 5 agents, columns keep `minmax(220px,1fr)` and the grid scrolls horizontally
    inside its own container.
  - Tabs stays one click away.

  Alternative: switch the default to Tabs automatically above 5.
- **Q-g. (new) Results source.** A results URL shows each selected agent's latest run on the PR,
  not "the runs started by this click". So a stale column briefly shows the previous run until
  the new run row is listed. **Recommended:** accept this, and show `starting` while the POST is in
  flight. Alternative: carry the started `run_id`s in the URL (`?runs=`) for exact grouping.
