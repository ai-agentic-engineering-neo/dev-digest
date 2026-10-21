# Pages (route contract)

Every route under `client/src/app`, what it calls, which URL params it owns,
and which browser flow in `../../e2e/specs/` exercises it. Hooks are in
`src/lib/hooks/*`; endpoints are the Fastify paths those hooks call. Paths in
this file are relative to `client/` unless they start with `../`.

| Route | Purpose | Main hooks | URL params | e2e flow |
|---|---|---|---|---|
| `/` | redirect to the first repo's PR list | `useRepos` | none | `01-app-boot` (and 02, 04, 05, 08 start here) |
| `/onboarding` | add a repository by URL | `useAddRepo` | none | `06-onboarding` |
| `/repos/[repoId]/pulls` | PR list with filters | `usePulls`, `useRefreshRepo` | `?status` | `01`, `02`, `08` |
| `/repos/[repoId]/pulls/[number]` | PR detail: Overview, Agent runs, Files changed | `usePulls`, `usePullDetail`, `usePrReviews`, `usePrRuns`, `usePrActiveRuns`, `usePrIntent`, `useBlastRadius`, `usePrBrief`, `useGenerateBrief` | `?tab`, `?trace`, `?file`, `?line` | `02`, `04`, `05`, `08`, `12`, `13`, `16` |
| `/agents` | agent cards, create modal | `useAgents`, `useUpdateAgent`, `useCreateAgent`, `useDeleteAgent` | none | `03-agents` |
| `/agents/[id]` | agent editor: Config, Skills | `useAgents`, `useAgent`, `useUpdateAgent`, `useProviderModels`, `useSkills`, `useAgentSkills`, `useSetAgentSkills` | `?tab` | `10-skills` |
| `/skills` | skill card grid, side preview panel, create modal, import drawer | `useSkills`, `useUpdateSkill`, `useDeleteSkill`, `useCreateSkill`, `usePreviewSkillImport`, `useSkill` | `?skill` | `10-skills` |
| `/skills/[id]` | skill editor: Config, Preview, Versioning | `useSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`, `useSkillVersionDiff`, `useRestoreSkillVersion` | path `id`, `?tab` | `10-skills` |
| `/conventions` | conventions extractor for the active repo | `useConventions`, `useExtractConventions`, `useDecideConvention`, `useDeselectConventions`, `useConventionSkillDraft`, `useCreateConventionSkill`, `useAgents` | none | `11-conventions` |
| `/context` | Project Context: the sidebar repo's Markdown documents, preview, edit with local override and reset, used-by and coverage | `useContextFiles`, `useRefreshContext`, `useContextFile`, `useSaveContextFile`, `useResetContextFile`, `useAgents` | `?doc` | `14-project-context` |
| `/settings/[section]` | API keys, feature models | `useSecretsStatus`, `useTestConnection`, `useSettings`, `useUpdateSettings`, `useProviderModels` | path `section` | `07-settings` |

`/showcase` (`src/app/showcase/page.tsx`) renders the component gallery
(`src/components/showcase/Showcase.tsx`) outside `AppShell`; the same gallery
is mounted in both themes by `src/test/smoke.test.tsx`. Every other page except
`/onboarding` renders inside `AppShell` (sidebar, topbar, command palette, `g`
shortcuts).

## `/` (`src/app/page.tsx`)

- Calls `useRepos` (`GET /repos`). When the list is non-empty it
  `router.replace`s to `/repos/<first id>/pulls`; the fallback button opens
  the same target.
- Loading: three `Skeleton` bars. Error or zero repos: `EmptyState`
  "No repositories yet" with an "Add repository" CTA to `/onboarding`.
- Which repo is "first" is whatever `GET /repos` returns first.

## `/onboarding` (`src/app/onboarding/page.tsx` → `AddRepoView`)

- Single form: Repository URL (`TextInput`, Enter submits). Submit calls
  `useAddRepo` (`POST /repos { url }`), then navigates to
  `/repos/<repo.id>/pulls`. `Esc`, the close icon and Cancel go to `/`.
- Error: an inline red box with `ApiError.message` (or "Could not add
  repository"). Pending: button reads "Cloning…" and is disabled.
- Full-screen, outside `AppShell`. No API keys here; the copy links to
  `/settings/api-keys`.

## `/repos/[repoId]/pulls` (`src/app/repos/[repoId]/pulls/page.tsx`)

- Data: `usePulls(repoId)` (`GET /repos/:id/pulls`, refetch every 60 s and on
  window focus). Refresh button: `useRefreshRepo` (`POST /repos/:id/refresh`,
  invalidates `["repos"]` and `["pulls", repoId]`). `useRepoNotFound` shows
  `RepoNotFound` when `repoId` matches no loaded repo.
- URL: `?status=all|needs_review|reviewed|stale`, default `needs_review`,
  always written explicitly with `router.replace`. The text filter (title or
  number) and sort (`newest` | `oldest` by `updated_at`) are local state, not
  in the URL.
- Components: `FilterBar` (search, status `Chip`s, sort `SelectInput`,
  Refresh), header row from `COLUMN_KEYS`, one `PRRow` per PR. Header and rows
  share `GRID = "1fr 132px 92px 60px 72px 118px 78px"` in `pulls/constants.ts`.
- Subtitle: `{open} open · {needsReview} need review` where open counts
  `needs_review | reviewed | stale`.
- Loading: 4 `Skeleton` rows. Error: `ErrorState` with retry. No rows after
  filtering: `EmptyState` (`list.emptyAllBody` when status is `all`, otherwise
  `list.emptyStatusBody` with the status).

### PR list columns (`PRRow.tsx`)

| Column (`COLUMN_KEYS`, grid `GRID` in `pulls/constants.ts`) | Shows | Never reviewed (`score == null`, `cost_usd == null`) |
|---|---|---|
| Pull request | PR icon coloured by status, title, `#number` | same |
| Author | `Avatar` + `pr.author` | same |
| Size | `S · lines`, `M`, `L` bucket by additions + deletions (`< 100`, `< 400`, else) | same (size is from the diff, not the review) |
| Score | `CircularScore` of `pr.score` | `—` in `var(--text-muted)` |
| Findings | one icon + count per severity present in the latest review (`findings_critical` / `findings_warning` / `findings_suggestion`); hovering the cell opens the read-only `FindingsPopover` titled «N FINDINGS IN THIS RUN» with `latest_findings` previews (severity, title, category, `file:line`, `% confidence`, excerpt) and no buttons | `—`; no popover |
| Cost | `RunCostBadge` compact: `formatCost(pr.cost_usd)`, tooltip `{cost_runs} runs` | `—` (no tooltip because `cost_runs` is empty) |
| Status | dot `Badge` from `STATUS_META[pr.status]` | `Needs review` (warn colour); merged/closed PRs keep their GitHub state |
| Updated | `relativeTime(pr.updated_at)`: `now`, `12m`, `3h`, `2d` | same; `—` when missing |

Clicking a row pushes `/repos/<repoId>/pulls/<number>`.

## `/repos/[repoId]/pulls/[number]` (`.../[number]/page.tsx`)

- Resolves `number` → PR uuid from the cached `usePulls(repoId)` list, then
  `usePullDetail(prId)` (`GET /pulls/:id`), `usePrReviews` (`GET
  /pulls/:id/reviews`), `usePrRuns` (`GET /pulls/:id/runs`, polls 4 s while a
  run is `running`), `usePrActiveRuns` (`GET /pulls/:id/runs/active`, polls
  while non-empty). Mutations: `useCancelRun` (`POST /runs/:id/cancel`),
  `useDeleteRun` (`DELETE /runs/:id`).
- URL: `?tab=overview|findings|diff` (default `overview`) and
  `?trace=<runId>`; both via `router.replace`. Starting a review switches to
  `?tab=findings`. `?file=<path>` and `?line=<n>` are read only by the Files
  changed tab (deep link below); `openDiffAt` in `page.tsx` writes `tab=diff`,
  `file` and `line` in one `router.replace` (`line` removed when the reference
  has none) and keeps the other params. The brief card's cost line sets `?trace`.
- Loading: skeleton block while either the list or the detail loads. Error or
  missing PR: full-screen `ErrorState` "Couldn't load this pull request" with
  retry. Unknown repo: `RepoNotFound`.
- Header (`PrDetailHeader`): `#number title`, author, `branch → base`, `+add
  −del`, status badge, "View on GitHub" (disabled until the repo's
  `full_name` is known), `RunReviewDropdown`, and a warning banner when the
  PR is merged or closed. Tabs: Overview, Agent runs (count = all findings),
  Files changed (count = `files_count`).

### Tab `overview` (`OverviewTab`)

A "PR brief" section: the **PR Brief card** first, then a grid with two cards,
then the **Review focus** card full-width (only with a stored brief), then the PR
body as plain text under a "Description" label (nothing when `pr.body` is empty).
With no stored brief the grid and the description are unchanged.

- **PR Brief card** (`_components/PrBriefCard`, `usePrBrief` → `GET
  /pulls/:id/brief`, `useGenerateBrief` → `POST /pulls/:id/brief/generate`):
  states skeleton, load error with Retry, Generate (tooltip names the workspace's
  `risk_brief` model), running (spinner, previous brief kept, polls 2 s), stored
  (verdict tile from the newest review, findings and blockers badges, (i) popover,
  summary, PR SCORE ring, "Out of date" badge, cost line that opens `?trace=`),
  and an inline error for a failed run (no toast). Contract:
  [`pr-brief.md`](pr-brief.md); server half `server/specs/pr-brief.md`. Strings:
  `messages/en/brief.json`. Covered by e2e flow `16`.
- **Review focus** (`_components/ReviewFocusCard`): count badge and one
  `path:line — reason` button per item; a click calls `openDiffAt`.
- **Intent** (`IntentCard`, `usePrIntent` / `useRefreshIntent`): the derived
  intent, confidence badge, in/out of scope, a "Risk areas" sub-section from the
  stored brief (`RiskAreas`; absent when the brief has no risks), collapsed
  Sources disclosure.
- **Blast radius** (`_components/BlastRadiusCard`, `useBlastRadius` → `GET /pulls/:id/blast`,
  server spec `server/specs/blast-radius.md`): stat row (symbols · callers ·
  endpoints · crons, distinct across symbols), a Tree / Graph toggle
  (`aria-pressed` buttons), and the "Prior PRs touching these files"
  disclosure (collapsed, count badge). Tree: one expandable row per changed
  symbol with callers (first row open); a caller is `file:line` linked to
  GitHub at `head_sha` (`githubBlobUrl`), because caller files are not in the
  diff; endpoint chips (`--info`) and cron chips (`--warn`) follow. Graph: an
  SVG with three columns, changed symbols → callers → endpoints and crons,
  capped at 6 / 10 / 8 nodes per column with a "+N more" node, plus a legend.
  Prior PRs: `#number`, title linked to the PR on GitHub, author avatar, date
  (`merged_at` as `YYYY-MM-DD`), files in common, the note. States: skeleton
  while loading; `degraded` with data shows an "Approximate" badge; `degraded`
  with no symbols and no callers shows an empty state with the reason
  (`blast.empty.<reason>`) and a "Rebuild index" action
  (`useResyncRepoIntel` → `POST /repos/:id/resync`), after which the card polls
  `useRepoIntelStatus` until the index row's `updatedAt` advances and then
  refetches the map; a map with symbols but no
  callers shows "N changed symbols, no downstream callers found." Strings:
  `messages/en/blast.json`. Covered by e2e flow `13`.

### Tab `findings` ("Agent runs", `FindingsTab`)

Sections in order:

1. **Live review**: only while `liveRunIds` is non-empty. `RunStatus` opens
   SSE streams (`useRunEvents` → `/runs/:id/events`) into `LiveLogStream`;
   Cancel calls `useCancelRun` for every live run; "Open run trace" sets
   `?trace` to the first live run. When streams close, `onRunDone`
   invalidates active runs, run history and refetches reviews.
2. "Review in progress…" note while anything is running.
3. "Lethal Trifecta detected" banner when any finding has
   `kind === "lethal_trifecta"`.
4. **Timeline** (`RunHistory`): runs (`RunSummary`) and commits (`pr.commits`)
   merged newest first. A run row shows an outcome badge (`running`, `error`,
   `cancelled`, or for done runs `rejected` when `blockers > 0`, `reviewed`
   when findings exist, else `approved`), `CircularScore`, agent name (click
   scrolls to its accordion), `provider/model`, the error text for failed
   runs, finding and blocker counts, the time, a full `RunCostBadge`
   (`9,119 tok · $0.0013`) for `status === "done"` only, an "Open run trace &
   logs" button (`?trace=`) and Delete (hidden while running).
5. **Review runs**: one `ReviewRunAccordion` per `ReviewRecord`, newest
   first, first one open. Header: agent, verdict badge, `N findings · M
   blockers` (blockers = undismissed CRITICAL), full `RunCostBadge` when the
   joined run is `done`, score, timestamp, delete (`useDeleteReview`, `DELETE
   /reviews/:id`). Body: `VerdictBanner` and `FindingsPanel`.
6. `FindingsPanel`: severity counter pills (`countBySeverity`, CRITICAL,
   WARNING, SUGGESTION), one filter `Chip` per severity (click again to
   clear), "Hide low confidence" toggle (`< 0.65`), findings sorted CRITICAL
   → INFO, `j`/`k` move focus, `a`/`d` call `useFindingAction`
   (`POST /findings/:id/accept|dismiss`). `FindingCard` shows severity,
   category, `file:line` linked to GitHub at `head_sha`, confidence, markdown
   rationale and suggestion, and Accept / Reject buttons (the reject button
   still sends the `dismiss` action; only the label in `prReview.json`
   changed).

Empty: `EmptyState` "No findings yet" when there are no reviews and nothing
is running.

### Tab `diff` ("Files changed", `DiffTab`)

Server half of the grouping: [`server/specs/smart-diff.md`](../../server/specs/smart-diff.md).

Data: `useSmartDiff` (`GET /pulls/:id/smart-diff`, key `["smart-diff", prId]`),
`usePrReviews`, `usePrComments` (`GET /pulls/:id/comments`), `useCreatePrComment`
(`POST /pulls/:id/comments`), `useFindingAction` (`POST /findings/:id/accept|dismiss`).
Posting is allowed only when `pr.status === "open"`. The client never classifies
a path; it joins each server group's paths to `pr.files` (patch text) in
`DiffTab/helpers.ts` `joinGroupFiles`.

- **Toolbar**: "Reviewer-ordered diff" label, `N files · +a −d`, `OrderToggle`
  (Smart order / Original order, `aria-pressed`, component state, default
  Smart, not kept in the URL) and the comments toggle.
- **Smart order**: one `RoleGroup` per non-empty server group, in server order
  (core, tests, wiring, docs, boilerplate). Header (button, `aria-expanded`,
  sticky `top: 0`): role label, caption, `● N` (files with open findings) or
  "Review not run yet" when `has_review` is false, and the file count. Docs and
  boilerplate start collapsed (`DEFAULT_COLLAPSED`); the body is a `DiffViewer`.
- **Original order**: plain `DiffViewer` over `pr.files` (GitHub order), inline
  findings included. Smart order falls back to this while `useSmartDiff`
  loads or fails.
- **Inline findings** (`DiffFindingApi`, `components/diff-viewer/findings.ts`):
  a file with an open finding shows a red dot in its card header (label "Has
  findings", independent of the comments toggle). Findings anchor to the new
  side of the patch: a coloured left stripe on each line of the range and a
  severity pill on the first, both for open findings only; a `FindingComment`
  (severity, title, category, confidence, rationale, suggested fix) renders
  after the last line of the range. A finding with no rendered line in the patch
  renders in an end-of-file block "Findings outside the diff". Accept / Reject
  call `useFindingAction` (`accept` / `dismiss`); a dismissed finding keeps its
  comment with a "rejected" tag but loses stripe, pill and dot. The close
  button collapses a comment to one line. Errors surface through the global
  mutation toast.
- **Comments toggle**: one "Hide comments (n) / Show comments (n)" button covers
  GitHub comments and findings (n = both), shown when n > 0. Comments and
  findings are **visible by default**; hiding keeps the file dot.
- **Refresh**: `useFindingAction`, `useDeleteReview`, `useDeleteRun` and
  `useRunReview` also invalidate `["smart-diff", prId]`; `page.tsx` calls
  `useRefreshOnRunsSettled(prId, reviewRunning)`, which invalidates `["reviews",
  prId]` and `["smart-diff", prId]` when a run goes from running to settled, on
  any tab.
- **Deep link** (`?file=<path>&line=<n>`): `resolveDeepLink` accepts the path
  only when it is a changed file of the PR and the line only as a positive
  integer. On a hit the file's `RoleGroup` and `FileCard` expand (`forceOpen`),
  the file (or the `data-line` row when rendered) scrolls into view once, and the
  line is tinted for 2 s (`useDiffDeepLink`). Unknown file or unrendered line:
  the tab opens normally, no error, no toast. The params stay in the URL.
  Details: [`pr-brief.md`](pr-brief.md).
- Strings: `messages/en/prReview.json` namespace `smartDiff`.

### Trace drawer (`?trace=<runId>`, `RunTraceDrawer`)

720 px `Drawer` with tabs Trace and Live log. The page mounts it without
`running`, so it loads the persisted `useRunTrace` (`GET /runs/:id/trace`)
and its Live log tab shows `trace.log`. Trace tab (`TraceBody`):
Configuration, Stats (`DURATION`, `TOKENS` as `8k→0.9k`, `COST` via
`formatCost`, `FINDINGS`), Findings, Prompt assembly, Tool calls, Raw output.
Footer: Copy raw output. States: "Loading trace…", "No trace available yet."
Project context blocks and the Specs read tokens: `specs/project-context.md`.
A brief run opens here from the PR Brief card's cost line: the title falls back
to `config.agent` ("PR Brief"), Findings is empty and the tool call is
`generate_brief`.

## `/agents` (`src/app/agents/page.tsx` → `AgentsListView`)

- Master-detail like `/skills` (design "Agent Editor · Context", applied
  2026-10-21): the agents column and the editor live on `/agents/[id]`, so this
  view opens the first agent (`router.replace` to `/agents/<id>?tab=config`)
  once `useAgents` (`GET /agents`) answers. Loading: a skeleton. Error:
  `ErrorState` with retry. Empty: `EmptyState` with a create CTA that opens
  `CreateAgentModal` (`useCreateAgent`, `POST /agents`, then
  `/agents/<id>?tab=config`).

## `/agents/[id]` (`src/app/agents/[id]/page.tsx`)

- Left column (`aside` «Agents»): the heading, the **Add Agent** dropdown
  (*Create from scratch* and the template entries all open
  `CreateAgentModal`), a search box (`filterAgents` over name + description)
  and one `AgentCard` per agent (`useAgents`): accent icon chip, name, enabled
  `Toggle` (`useUpdateAgent`, `PUT /agents/:id`), trash icon → `ConfirmDialog`
  → `useDeleteAgent` (`DELETE /agents/:id`), one-line description, model chip,
  `N skills`, and the stats footer (`Agent.stats`, computed server-side per
  workspace): `N runs` (completed runs), `P% accept` (accepted share of
  decided findings, «— accept» until one finding is accepted or dismissed) and
  `$X avg` (`formatCost` of the mean cost of completed runs with a known cost,
  «— avg» until one exists). Clicking a card keeps the current `?tab=`.
- Right side: header (icon chip, name, `provider/model` badge, disabled badge,
  **Run Review** → `/`) over `AgentEditor` for `useAgent(id)`
  (`GET /agents/:id`).
- URL: `?tab=config|skills|context` (`VALID_TABS`); `config` is the fallback.
  `AgentEditor` `TABS` has Config, Skills and Context (the Context tab attaches
  project documents; contract in `specs/project-context.md`).
- `ConfigTab`: name, description, provider, model (`SearchableSelect` fed by
  `useProviderModels(provider)`, `GET /providers/:provider/models`; an empty
  list shows a "key missing" hint), strategy, CI fail-on, repo intel toggle,
  system prompt, output schema (fixed), enabled. Save calls `useUpdateAgent`
  and toasts `Saved (vN)`.
- `SkillsTab` (L02): every workspace skill as a row (`useSkills` +
  `useAgentSkills`, `GET /agents/:id/skills`); linked rows first in prompt
  order with a drag grip and ↑/↓ buttons, checkbox = linked, `disabled`
  badge when the skill is off globally, «N of M enabled» badge, filter, and a
  "Manage skills" link to `/skills`. Any change calls `useSetAgentSkills`
  (`POST /agents/:id/skills { skill_ids }`), which bumps the agent version.
- Loading: skeletons in the editor pane. Error or missing agent: full-screen
  `ErrorState` "Couldn't load this agent" with retry.
- Agent cards (both pages): the trash icon opens `ConfirmDialog` before
  `useDeleteAgent`.

## `/skills` (`src/app/skills/page.tsx` → `SkillsView`)

- Master-detail (design "Skill Editor", applied 2026-10-21): a Skills column
  on the left (`aside` «Skills»: the heading, the **Add Skill** dropdown, a
  search box and one `SkillCard` per skill) and the `SkillEditor` inline on
  the right for `?skill=<id>`. With no `?skill=` the page opens the first
  skill (`router.replace`); clicking a card writes `?skill=<id>` and keeps
  the current `?tab=`. Back leaves the page (replace, not push). The page
  wraps the view in `Suspense` because it reads `useSearchParams`.
- `useSkills` (`GET /skills`). Cards (`SkillCard`): type-coloured icon chip,
  mono name (a `<button>` with `aria-pressed` when selected), enabled
  `Toggle` (`useUpdateSkill`, `PUT /skills/:id`), one-line description, type
  tag, source with icon, «needs vetting» badge for an imported skill that is
  still disabled, and `N agents` (`agent_count`). Deleting lives in the
  editor's Config tab. Local search filters name, description and type
  (`filterSkills`).
- "Add Skill" dropdown: *Create from scratch* opens `CreateSkillModal`
  (`useCreateSkill`, `POST /skills`) then selects the new skill
  (`/skills?skill=<id>`); *Import from file* opens `ImportSkillDrawer` (file →
  base64 → `usePreviewSkillImport`, `POST /skills/import/preview` → editable
  preview with ignored entries and a trust notice → `POST /skills` with
  `source: imported_file`, `enabled: false`).
- Loading: three card skeletons in the column. Error: `ErrorState` with
  retry. Empty: `EmptyState` with a create CTA in the editor area; a search
  with no hits shows «No matching skills» in the column while the editor
  stays. Full contract: `specs/skills.md`.

## `/skills/[id]` (`src/app/skills/[id]/page.tsx`)

- Server page that redirects to `/skills?skill=<id>` (keeping `?tab=`), so
  old links land on the inline editor. The editor itself
  (`[id]/_components/SkillEditor`, rendered by `SkillsView`): header with a
  type-coloured icon chip, mono name, type tag, `vN`, source, agent count,
  disabled / needs-vetting badges; tabs `?tab=config|context|preview|versioning`
  (`VALID_SKILL_TABS`, default `config`, written by the page with
  `router.replace`); the Context tab is specified in `specs/project-context.md`.
- Config: `SkillForm` keyed by `id:version` (a save or restore remounts it),
  Save (`useUpdateSkill`, toast `Skill saved (vN)`), Delete (`ConfirmDialog`
  → `useDeleteSkill` → `/skills`, which opens the first remaining skill).
- Preview: the body through the `Markdown` primitive.
- Versions: `useSkillVersions` (`GET /skills/:id/versions`), newest first;
  the current version carries a `current` badge; previous versions offer
  **Diff** (`useSkillVersionDiff`, `GET …/versions/:v/diff`, rendered by
  `PatchView` with a «N added · M removed against vX» summary) and **Restore**
  (`ConfirmDialog` → `useRestoreSkillVersion`, `POST …/versions/:v/restore`,
  toast `Restored vA as vB`).
## `/conventions` (`src/app/conventions/page.tsx` → `ConventionsView`)

- Repo comes from `useActiveRepo` (switcher / `localStorage`, no URL param).
  `useConventions(repoId)` (`GET /repos/:id/conventions`) polls every 2 s while
  a scan runs. **Run Scan** / **Re-scan** → `useExtractConventions`
  (`POST …/conventions/extract`).
- Candidate cards (`CandidateCard`): rule, category badge, evidence
  `path:line` + copy, snippet, confidence bar; Accept / Reject / Edit (inline
  rule + category form) through `useDecideConvention` (`PUT /conventions/:id`).
  Rejected cards are hidden unless «Show N rejected» is on. Toolbar: Deselect
  all (`POST …/conventions/deselect`), «N of M accepted», **Create skill**
  (visible with ≥ 1 accepted) → `CreateSkillModal` (`useConventionSkillDraft`,
  editable name / description / type / enabled / agent / body,
  `useCreateConventionSkill` → `POST …/conventions/skill` → `/skills?skill=`).
- States: no repos («Select a repository»), repo without clone («Repository
  not cloned yet»), nothing extracted (empty state with Run Scan CTA), all
  rejected. Full contract: `specs/conventions.md`.

## `/context` (`src/app/context/page.tsx` → `ProjectContextView`)

- Repo: the shell's active repository (`useActiveRepo`); the page has no
  selector of its own, and picking another repo in the sidebar keeps the page
  open and reloads it (`useShellContext.onSelectRepo` replaces the URL with
  `/context`). `?doc=<path>` selects the previewed document (`router.replace`).
  The page wraps the view in `Suspense` (`useSearchParams`).
- Two panes, no page title: a file panel (`FilePanel`: section label, shared
  folder, toolbar, compact icon-and-name rows, footer with document and token
  totals) and a document pane (`DocPane`). `useContextFiles`
  (`GET /repos/:id/context`) lists the documents;
  `useContextFile` (`GET /repos/:id/context/file?path=`) feeds the opened
  document, shown as rendered Markdown (Preview pill) or an editable textarea
  (Edit pill; Save and Ctrl/Cmd+S store a local override, Reset to repository
  version removes it; a «Modified locally» badge and a row marker flag it), with
  the token badge, «Used by N agents» and a Coverage ring (`agents_using` over
  the enabled agents from `useAgents`) in the pane header. The panel toolbar
  has the refresh icon (`useRefreshContext`) and the design's add / folder /
  upload icons, disabled until they have a backend. Attaching happens in the
  editors' Context tabs. Unsaved text is guarded on document switch, mode
  switch and a sidebar repository change.
- States: skeleton, «No repository yet», «Repository not cloned» error state
  with Retry, load error with Retry, empty state naming `specs, docs, insights`,
  «Select a document», a notice for a too-large document. Full contract:
  `specs/project-context.md`.

## `/settings/[section]` (`src/app/settings/[section]/page.tsx` → `SettingsView`)

- Sections come from `SETTINGS_SECTIONS` in `src/vendor/ui/nav.ts`:
  `api-keys` ("API Keys") and `models` ("Feature Models"). Left nav links to
  `/settings/<key>`; an unknown key falls back to the first section's label
  with an `EmptyState`.
- `api-keys` (`SettingsApiKeys`): one `KeyRow` per entry in `KEY_ROWS`
  (`openai`, `anthropic`, `openrouter`, `github`). `useSecretsStatus` (`GET
  /settings/secrets-status`) drives the Configured / Not set pill; "Test
  connection" calls `useTestConnection` (`POST /settings/test-connection`)
  with the typed key, shows the result inline, and on success invalidates
  `["provider-models"]` and `["secrets-status"]`. Keys are never read back.
- `models` (`SettingsModels`): one `SearchableSelect` per entry in
  `FEATURE_MODELS` (`src/lib/feature-models.ts`), options from
  `useProviderModels("openrouter")`, persisted through `useUpdateSettings`
  (`PUT /settings { feature_models }`) with `useSettings` (`GET /settings`)
  as the source.
