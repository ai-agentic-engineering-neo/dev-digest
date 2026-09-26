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
| `/repos/[repoId]/pulls/[number]` | PR detail: Overview, Agent runs, Files changed | `usePulls`, `usePullDetail`, `usePrReviews`, `usePrRuns`, `usePrActiveRuns` | `?tab`, `?trace` | `02`, `04`, `05`, `08` |
| `/agents` | agent cards, create modal | `useAgents`, `useUpdateAgent`, `useCreateAgent`, `useDeleteAgent` | none | `03-agents` |
| `/agents/[id]` | agent editor: Config, Skills | `useAgents`, `useAgent`, `useUpdateAgent`, `useProviderModels`, `useSkills`, `useAgentSkills`, `useSetAgentSkills` | `?tab` | `10-skills` |
| `/skills` | skill card grid, side preview panel, create modal, import drawer | `useSkills`, `useUpdateSkill`, `useDeleteSkill`, `useCreateSkill`, `usePreviewSkillImport`, `useSkill` | `?skill` | `10-skills` |
| `/skills/[id]` | skill editor: Config, Preview, Versioning | `useSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`, `useSkillVersionDiff`, `useRestoreSkillVersion` | path `id`, `?tab` | `10-skills` |
| `/conventions` | conventions extractor for the active repo | `useConventions`, `useExtractConventions`, `useDecideConvention`, `useDeselectConventions`, `useConventionSkillDraft`, `useCreateConventionSkill`, `useAgents` | none | `11-conventions` |
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
  `?tab=findings`.
- Loading: skeleton block while either the list or the detail loads. Error or
  missing PR: full-screen `ErrorState` "Couldn't load this pull request" with
  retry. Unknown repo: `RepoNotFound`.
- Header (`PrDetailHeader`): `#number title`, author, `branch → base`, `+add
  −del`, status badge, "View on GitHub" (disabled until the repo's
  `full_name` is known), `RunReviewDropdown`, and a warning banner when the
  PR is merged or closed. Tabs: Overview, Agent runs (count = all findings),
  Files changed (count = `files_count`).

### Tab `overview` (`OverviewTab`)

Renders the PR body as plain text under a "Description" label; renders
nothing when `pr.body` is empty.

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

`DiffViewer` over `pr.files`. Comments: `usePrComments` (`GET
/pulls/:id/comments`) and `useCreatePrComment` (`POST /pulls/:id/comments`);
posting is allowed only when `pr.status === "open"`. Comments start hidden;
a "Show comments (n)" button toggles them.

### Trace drawer (`?trace=<runId>`, `RunTraceDrawer`)

720 px `Drawer` with tabs Trace and Live log. The page mounts it without
`running`, so it loads the persisted `useRunTrace` (`GET /runs/:id/trace`)
and its Live log tab shows `trace.log`. Trace tab (`TraceBody`):
Configuration, Stats (`DURATION`, `TOKENS` as `8k→0.9k`, `COST` via
`formatCost`, `FINDINGS`), Findings, Prompt assembly, Tool calls, Raw output.
Footer: Copy raw output. States: "Loading trace…", "No trace available yet."

## `/agents` (`src/app/agents/page.tsx` → `AgentsListView`)

- `useAgents` (`GET /agents`); enable toggle on a card calls `useUpdateAgent`
  (`PUT /agents/:id`); trash icon calls `useDeleteAgent` (`DELETE
  /agents/:id`) after `window.confirm`.
- Local search filters name + description (`filterAgents`). "Add agent"
  dropdown opens `CreateAgentModal` (`useCreateAgent`, `POST /agents`), then
  navigates to `/agents/<id>?tab=config`. The template entries in that
  dropdown also just open the modal.
- Loading: three card skeletons. Error: `ErrorState` with retry. Empty:
  `EmptyState` with a create CTA. Clicking a card opens
  `/agents/<id>?tab=config`.

## `/agents/[id]` (`src/app/agents/[id]/page.tsx`)

- Left column lists all agents (`useAgents`, `AgentCard`); right side is
  `AgentEditor` for `useAgent(id)` (`GET /agents/:id`).
- URL: `?tab=config|skills` (`VALID_TABS`); `config` is the fallback.
  `AgentEditor` `TABS` has Config and Skills.
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

- `useSkills` (`GET /skills`). Cards (`SkillCard`): mono name, type tag,
  description, `vN · source · N agents` (`agent_count`), «needs vetting» badge
  for an imported skill that is still disabled, enabled `Toggle`
  (`useUpdateSkill`, `PUT /skills/:id`), and a Delete icon; `SkillsView`
  owns the single `ConfirmDialog` (Escape cancels) and calls `useDeleteSkill`
  (`DELETE /skills/:id`) on confirm.
  Local search filters name, description and type (`filterSkills`).
- "Add Skill" dropdown: *Create from scratch* opens `CreateSkillModal`
  (`useCreateSkill`, `POST /skills`) then navigates to `/skills/<id>`;
  *Import from file* opens `ImportSkillDrawer` (file → base64 →
  `usePreviewSkillImport`, `POST /skills/import/preview` → editable preview
  with ignored entries and a trust notice → `POST /skills` with
  `source: imported_file`, `enabled: false`).
- Clicking a card writes `?skill=<id>` (`router.replace`, so Back leaves the page) and renders
  `SkillPanel` on the right (`useSkill`, `GET /skills/:id`): badges, the
  vetting notice for imported skills, description, Markdown body, **Open
  editor** (→ `/skills/<id>`), Edit inline (`SkillForm`, Save →
  `useUpdateSkill`, toast `Skill saved (vN)`), Delete → `ConfirmDialog` →
  `useDeleteSkill` → back to `/skills`. Close clears the param. The page
  wraps the view in `Suspense` because it reads `useSearchParams`.
- Loading: three card skeletons. Error: `ErrorState` with retry. Empty:
  `EmptyState` with a create CTA; a search with no hits shows «No matching
  skills». Full contract: `specs/skills.md`.

## `/skills/[id]` (`src/app/skills/[id]/page.tsx` → `SkillEditor`)

- Server page awaits `params`, renders `SkillEditor` (`useSkill`). Header:
  name, type tag, `vN`, source, agent count, disabled / needs-vetting badges,
  «All skills» back button. Tabs via `?tab=config|preview|versioning`
  (`VALID_SKILL_TABS`, default `config`, written with `router.replace`).
- Config: `SkillForm` keyed by `id:version` (a save or restore remounts it),
  Save (`useUpdateSkill`, toast `Skill saved (vN)`), Delete (`ConfirmDialog`
  → `useDeleteSkill` → `/skills`).
- Preview: the body through the `Markdown` primitive.
- Versioning: `useSkillVersions` (`GET /skills/:id/versions`), newest first;
  the current version carries a `current` badge; previous versions offer
  **Diff** (`useSkillVersionDiff`, `GET …/versions/:v/diff`, rendered by
  `PatchView` with a «N added · M removed against vX» summary) and **Restore**
  (`ConfirmDialog` → `useRestoreSkillVersion`, `POST …/versions/:v/restore`,
  toast `Restored vA as vB`).
- Loading: skeletons. Error or missing skill: full-screen `ErrorState`
  «Skill not found» with retry.

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
