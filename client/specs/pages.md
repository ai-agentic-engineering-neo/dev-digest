# Pages — contract

**Status:** contract — describes shipped behaviour that must stay true. Change the code and this file in the same commit.

This contract covers every route under `src/app/`: what it renders, which hooks and endpoints feed it,
its URL params, and the visible copy the e2e flows depend on. The route ↔ endpoint diagram is in
[`../README.md`](../README.md#ui-route-map); the data layer is in
[`../docs/ui-architecture.md`](../docs/ui-architecture.md). Folded in:
[`01-run-cost-badge.md`](./01-run-cost-badge.md), [`02-findings-by-severity.md`](./02-findings-by-severity.md).
The flows are described in [`../../e2e/specs/flows.md`](../../e2e/specs/flows.md). Paths are relative to
`client/`; `PR/` = `src/app/repos/[repoId]/pulls/[number]/_components/`. There are seven routes and no
others: no `/showcase` (the gallery renders only in `src/test/smoke.test.tsx:4`), no `/settings` or
`/repos/:repoId` index (Next's 404).

## Routes

### `/`
- `AppShell` + "Welcome to DevDigest" (`src/app/page.tsx:22-23`); `useRepos` → `GET /repos` (`src/lib/hooks/core.ts:67-72`).
- ≥ 1 repo: `router.replace` to `/repos/<repos[0].id>/pulls` — the API's first repo, not the stored active
  repo (`page.tsx:15-19`); meanwhile an "Open <full_name>" button (`page.tsx:39-44`). Loading → skeletons
  (`page.tsx:24-29`). Zero repos **or a failed fetch** → EmptyState "No repositories yet", CTA "Add repository" → `/onboarding` (`page.tsx:30-37`).

### `/onboarding`
- Full-screen `AddRepoView`, no `AppShell` (`src/app/onboarding/page.tsx:7-9`): "Add a repository", field
  "Repository URL" (`AddRepoView.tsx:77,94`).
- Button or Enter (`AddRepoView.tsx:100-102,129-137`) → `useAddRepo` → `POST /repos {url}`, invalidates
  `["repos"]` (`core.ts:74-80`); "Cloning…" while pending (`:136`). Success → `/repos/<id>/pulls`
  (`:34-35`); failure → inline error plus the global toast (`:36-38,106-122`). Esc, × and Cancel → `/`
  (`:19-28,74,125-127`).

### `/repos/:repoId/pulls`
- `usePulls` → `GET /repos/:id/pulls`, 60 s poll (`core.ts:102-112`); Refresh → `useRefreshRepo` →
  `POST /repos/:id/refresh` (`pulls/page.tsx:96`, `core.ts:82-91`).
- `?status=all|needs_review|reviewed|stale`, default `needs_review`, always written explicitly
  (`pulls/page.tsx:38-44`, `constants.ts:34-39`); merged/closed PRs appear only under `all` (`page.tsx:51`).
  Search and sort are local state, not URL (`page.tsx:46-47`), though the header comment says `?sort` (`page.tsx:2`).
- Header "Pull Requests" + "{open} open · {needsReview} need review" (`page.tsx:76-80`). Columns
  (`constants.ts:42-51`, `messages/en/prReview.json:101-110`, uppercased by `styles.ts:105`, rendered by
  `PRRow.tsx:38-80`): PULL REQUEST (title, `#N`) · AUTHOR · SIZE (`S|M|L · lines`, cut at 100/400,
  `helpers.ts:4-8`) · SCORE (ring, `—` if never reviewed) · FINDINGS · STATUS · COST · UPDATED (`3h`, `2d`, `helpers.ts:11-21`).
- **COST** = total of **all the PR's `done` runs** (every agent, every re-run), `—` when none is known
  (`PRRow.tsx:76-79`; summed in `../server/src/modules/pulls/routes.ts:138-145`). SCORE and FINDINGS
  stay the **latest review** (`routes.ts:187-189`).
- **FINDINGS**: chips from `findings_by_severity`; `—` never reviewed, `0` none (`FindingsCell.tsx:17-19`).
  The first hover enables `usePrReviews` → `GET /pulls/:id/reviews` (`FindingsCell.tsx:14-15,30`). The
  popover header reads **"N FINDINGS IN THIS RUN"**: `severityCounts.header` (`prReview.json:125`),
  uppercased by `src/components/severity-counts/styles.ts:52` (`SeverityPopover.tsx:138-141`). A click
  inside it does not open the row (`SeverityPopover.tsx:136`).
- Row click → `/repos/:repoId/pulls/:number` (`PRRow.tsx:35`). States: unknown repo → `RepoNotFound`;
  skeletons; "Couldn’t load pull requests"; "No pull requests" (`page.tsx:64-70,107-128`).

### `/repos/:repoId/pulls/:number`
- `:number` → uuid via the cached `usePulls` list (`[number]/page.tsx:33-36`), then `usePullDetail` → `GET /pulls/:id`,
  `usePrReviews`, `usePrActiveRuns` → `GET /pulls/:id/runs/active`, `usePrRuns` → `GET /pulls/:id/runs`,
  `useDeleteRun` → `DELETE /runs/:id`, `useCancelRun` → `POST /runs/:id/cancel` (`[number]/page.tsx:35-50`).
- `?tab=overview|findings|diff`, default `overview` (`:60,137-171`); any other value renders an empty body.
  `?trace=<runId>` opens `RunTraceDrawer` over any tab (`:61,174-182`). Both go through `router.replace` (`:62-67`).
- States: `RepoNotFound` (`:90-96`); skeleton (`:98-108`); full-screen "Couldn't load this pull request",
  also when the number is not in the repo's PR list (`:110-121`).
- Header (`PR/PrDetailHeader/PrDetailHeader.tsx`): `#N` + title, author, `branch → base`, `+a −d`, status
  (`:48-78`); "View on GitHub" (`:81-91`); Run Review ▾ (`:92-99`); a merged/closed banner (`:102-110`);
  hardcoded tabs **Overview**, **Agent runs** (count = findings of all reviews, `[number]/page.tsx:72-77`),
  **Files changed** (count = `files_count`) (`:111-119`).
- Run Review ▾ (`PR/RunReviewDropdown/RunReviewDropdown.tsx`): a merged warning on merged/closed PRs (`:66-71`);
  "Run all enabled agents" (`:72-77`); every agent, disabled ones hinted `· disabled` (`:54-61`), or "No agents
  yet — create one" (`:61`); "Configure agents…" → `/agents` (`:81`). A pick sends `POST /pulls/:id/review`
  (`src/lib/hooks/reviews.ts:124-136`), switches to `tab=findings`, refreshes active runs (`[number]/page.tsx:132-133`).
- Overview: only "Description", the PR body as plain text, nothing when empty (`PR/OverviewTab/OverviewTab.tsx:14-19`).
  Files changed: "Files changed · N files" + `DiffViewer` (`PR/DiffTab/DiffTab.tsx:60-62`); GitHub review
  comments via `GET`/`POST /pulls/:id/comments` (`reviews.ts:91-115`), hidden until "Show comments (N)"
  (`DiffTab.tsx:22,48-57`); posting only on open PRs (`[number]/page.tsx:169`).

### `/agents`
- Server wrapper → `AgentsListView` (`src/app/agents/page.tsx:5-7`). `useAgents` → `GET /agents`; card
  toggle → `PUT /agents/:id` (`AgentsListView.tsx:20-21,90`); card delete → confirm → `DELETE /agents/:id`
  (`AgentCard.tsx:27,44`). Search is local, over name and description (`helpers.ts:4-8`).
- "Add Agent ▾": "Create from scratch" + five templates, all opening the same `CreateAgentModal`
  (`AgentsListView.tsx:45-63`, `constants.ts:4`) → `POST /agents` → `/agents/:id?tab=config`
  (`CreateAgentModal.tsx:16,24-32`); a card click opens the same URL (`AgentsListView.tsx:89`). States:
  skeletons, "Could not load agents.", "No agents yet" (`AgentsListView.tsx:66-82`).

### `/agents/:id`
- Agent list on the left (`useAgents`), editor for `useAgent` → `GET /agents/:id`
  (`src/app/agents/[id]/page.tsx:23-25`). `?tab=` accepts only `config`, else falls back to it (`:15,27`).
  `ConfigTab` saves with `PUT /agents/:id` and a success toast, models from `GET /providers/:p/models`
  (`ConfigTab.tsx:17,41,56-74`).
- Failed load or missing agent → full-screen "Couldn’t load this agent" (`page.tsx:40-50`). "Add ▾ →
  Create from scratch" goes to `/agents`, not the modal (`:78`); "Run on a PR…" goes to `/` (`:111-113`).

### `/settings/:section`
- Server wrapper → `SettingsView` (`src/app/settings/[section]/page.tsx:5-7`). Sub-nav from vendored `SETTINGS_SECTIONS`:
  `api-keys` "API Keys", `models` "Feature Models" (`src/vendor/ui/nav.ts:39-42`, `SettingsView.tsx:28-35`).
- `api-keys`: four rows, OpenAI, Anthropic, OpenRouter, GitHub PAT (`SettingsApiKeys/constants.ts:11-16`),
  each with Configured / Not set from `GET /settings/secrets-status` and "Test connection" →
  `POST /settings/test-connection` (`SettingsApiKeys.tsx:39-50,83,93`).
- `models`: one picker per feature, each pick `PUT /settings`, options from
  `GET /providers/openrouter/models` (`SettingsModels.tsx:22-33,39`). Any other section → EmptyState
  titled with the **first** section's label ("API Keys") and `settings.fallbackBody` (`SettingsView.tsx:21,42-48`).

## PR detail — Agent runs tab

`PR/FindingsTab/FindingsTab.tsx`, top to bottom. Section titles and their right-hand notes are hardcoded JSX.

1. **Live review** while the server reports running runs (`:86-111`; `liveRunIds` from `usePrActiveRuns`,
   `[number]/page.tsx:48`): "Cancel" (all) and "Open run trace" (first) above `RunStatus`'s SSE log (`:109`).
2. **"Review in progress…"** banner while any run is live (`:113-121`).
3. **"Lethal Trifecta detected"** + "N finding(s)" if a finding has `kind: lethal_trifecta` (`:123-131`, `[number]/page.tsx:76`).
4. **Timeline**, "runs & commits · newest first", when there are runs or commits (`:133-152`).
5. **Review runs**, "grouped by run · newest first" (`:154-159`): one `ReviewRunAccordion` per review, the
   first open (`:170-181`); EmptyState "No findings yet" when there are none and nothing runs (`:160-167`).

**Timeline row** (`PR/RunHistory/RunHistory.tsx`), between dashed commit rows (short sha, first message
line, author, time; `:128-157`), newest first (`:116-123`):
- outcome badge `running` / `error` / `cancelled`; a `done` run reads `rejected` (blockers), `reviewed`
  (findings) or `approved` (`:24-38,166-168`); a score ring for `done` (`:169`);
- the agent name, a button that opens and scrolls to its Review run (`:172-190`,
  `ReviewRunAccordion.tsx:48-54`); `provider/model` (`:191-193`); the error of a `failed` run (`:195-202`);
- a `done` run with findings: severity chips + hover popover, else "N finding(s)" (`:203-218`); time and
  **cost for every run**, `$0.0013 · 8.2K→1.3K`, `—` when none (`:220-224`);
- the FileText icon opens `?trace=` (`:225-233`), and the row itself has no click (`:165`); the Trash icon
  (not while running) → confirm → `DELETE /runs/:id` (`:234-244`, `[number]/page.tsx:152-155`).

**Review run card** (`PR/ReviewRunAccordion/ReviewRunAccordion.tsx`):
- header: agent; verdict with `_` → space, e.g. `request changes` (`:92-96`); "N findings · N blockers" (blockers =
  CRITICAL not rejected, `:57,97-100`); detailed cost (`:102-108`); score (`:109-113`); time; Trash → confirm → `DELETE /reviews/:id` (`:117-137`).
- expanded, top to bottom: `VerdictBanner` (verdict, "N findings", agent, summary, score ring + "PR SCORE";
  `VerdictBanner.tsx:36-55`), then `FindingsPanel`:
  - pill row **"N CRITICAL · N WARNING · N SUGGESTION"**, present severities only, counting accepted and
    rejected findings too (`FindingsPanel.tsx:65-80`, `prReview.json:34-38`, `severity-counts/helpers.ts:7-16`);
  - filter buttons **Critical / Warning / Suggestion**, one at a time, second click clears (`FindingsPanel.tsx:43-46,82-95`);
    "Hide low confidence" hides < 0.65 (`:96-99`, `FindingsPanel/constants.ts:12`); none left → "No findings match" (`:103-104`);
  - cards sorted by severity, the first expanded (`FindingsPanel/helpers.ts:5-16`, `FindingsPanel.tsx:106-117`).
- finding card (`PR/FindingCard/FindingCard.tsx`): severity, title, category, `accepted` / `rejected` tag
  (`:64-65`), `file:line` linked to GitHub (`:68-70`), confidence; expanded: rationale, "Suggested fix",
  **Accept** / **Reject** (`:91-111`). Reject is copy only; it posts `/findings/:id/dismiss`
  (`reviews.ts:153-155`, `prReview.json:6-7`). `j`/`k`/`a`/`d` act on the focused card (`FindingsPanel.tsx:49-61`).

## Copy that e2e flows assert

No `data-testid`s: flows match visible text and URLs. "Seed" = `../server/src/db/seed.ts`.

| Flow | Asserts | Lives in |
| --- | --- | --- |
| `01-app-boot` | URL `/pulls`; "Pull Requests" | Redirect `src/app/page.tsx:17`; heading `prReview.json:77`. The sidebar item reads the same (`src/vendor/ui/nav.ts:25`), so the text alone proves little |
| `02`, `04`, `05` | "Add rate limiting to public API endpoints"; URL `/pulls/482` | Seed `:105-106`; `PRRow.tsx:35,41`; `PrDetailHeader.tsx:54`. The row is under the default `needs_review` filter because the seed PR was never reviewed (`../server/src/modules/pulls/status.ts:51`) |
| `03-agents` | "Security Reviewer" | Seed `:194`, via `AgentCard` |
| `04-pr-findings` | button "Agent runs"; `tab=findings`; "request changes"; "2 findings"; "Hardcoded Stripe secret key in commit" | `PrDetailHeader.tsx:117` (a plain `<button>` whose name includes the count, `src/vendor/ui/kit/Tabs.tsx:25-49`); `[number]/page.tsx:68`; `ReviewRunAccordion.tsx:94` (seed `:142`); `ReviewRunAccordion.tsx:98` and `prReview.json:25` (seed `:150-175`); seed `:158`, visible because the first run is open (`FindingsTab.tsx:175`) |
| `05-pr-diff` | button "Files changed"; `tab=diff`; "src/config.ts" | `PrDetailHeader.tsx:118`; seed `:123` via `DiffViewer` |
| `06-onboarding` | "Add a repository"; "Repository URL" | Hardcoded, `AddRepoView.tsx:77,94` |
| `07-settings` | URLs `/settings/api-keys`, `/settings/models`; "API Keys"; "Feature Models" | `nav.ts:40-41` (sub-nav, crumb) and `messages/en/settings.json:6,24` (section titles) |

## When you change this

- **Copy in the table:** update the flow in `../../e2e/specs/` in the same commit and run
  `cd e2e && npm run e2e:hermetic`. Moving hardcoded copy into `messages/en/` is fine if the text is identical.
- **Routes, hooks, URL:** a new route or tab goes here and into the route map in `../README.md`; a new
  hook or query key into the table in `../docs/ui-architecture.md`. The `?tab` keys, the `?status`
  default and `?trace` are contract: flows wait on `tab=findings` and `tab=diff`.
- **Semantics:** PR-list COST, SCORE and FINDINGS are computed on the server; amend `../../server/specs/`
  first. `dismiss` stays the API action, the `d` shortcut and `dismissed_at`; only the copy says Reject.
