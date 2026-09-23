# Flows — contract

**Status:** contract — describes the shipped flows and the app behaviour they pin. Change a flow, the UI copy it asserts, or the seed together with this file.

This file is prose; the executable flows are the seven `NN-name.flow.json` next to
it, and `run.ts` loads only names ending in `.flow.json` (`run.ts:55`). Step format:
[`../README.md`](../README.md); the stack: [`../docs/hermetic-runner.md`](../docs/hermetic-runner.md);
routes and tabs: [`../../client/specs/pages.md`](../../client/specs/pages.md).
Citations are `path:line`, relative to `e2e/`.

README drift: its example and coverage row have flow 01 waiting for `#482`
(`README.md:21,96`), but the PR is first asserted in 02; its row for 04 says
"expand → FindingCard" (`README.md:99`), but 04 never expands.

## Seeded data the flows rely on

`pnpm db:seed` on the hermetic runner's empty DB (`../scripts/e2e.sh:125-128`):

| Data | Value | Flows | Seed |
| ---- | ----- | ----- | ---- |
| repo | `acme/payments-api`, the only repo | 01, 02, 04, 05 | `../server/src/db/seed.ts:73-91` |
| PR | #482 "Add rate limiting to public API endpoints", head `a1b2c3d4e5f6`, no `last_reviewed_sha` | 02, 04, 05 | `../server/src/db/seed.ts:94-117` |
| `pr_files` | 4 rows, one of them `src/config.ts` | 05 | `../server/src/db/seed.ts:120-125` |
| `pr_commits` | 1 commit | — | `../server/src/db/seed.ts:128-133` |
| review | `request_changes`, score 61, `model: 'seed'`, no agent, no run | 04 | `../server/src/db/seed.ts:136-148` |
| findings | CRITICAL "Hardcoded Stripe secret key in commit", WARNING "N+1 query in user list endpoint" | 04 | `../server/src/db/seed.ts:150-175` |
| agents | General, Security and Performance Reviewer | 03 | `../server/src/db/seed.ts:180-221` |

- **List status is derived.** The seed puts `'needs_review'` in the merge-state column
  (`../server/src/db/seed.ts:114`); the list derives `needs_review` from the null `last_reviewed_sha`
  (`../server/src/modules/pulls/routes.ts:178-184`, `../server/src/modules/pulls/status.ts:7-10,49-51`).
  The list defaults to `?status=needs_review` (`../client/src/app/repos/[repoId]/pulls/page.tsx:39,51`).
- **No `agent_runs` rows** (`../server/src/db/seed.ts:31-224`), so the accordion header
  reads `Agent` (`../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:91`).
- **Review and findings are written only with a new PR #482** (`../server/src/db/seed.ts:99`):
  re-seeding a DB that still has the PR does not restore a deleted seeded review.

## Flows

All flows share one browser session (`run.ts:104-111`) and each starts with `open`.
Several asserted strings appear twice on a page; the preceding `wait --url` proves the navigation.

### 01 — App boots and lands on a repo's PR list

`open /`, `networkidle`, then:

- `wait --url /pulls`: the root redirects to `/repos/<first repo>/pulls` only when the
  API returns a repo (`../client/src/app/page.tsx:15-19`), else shows an empty state.
- `wait --text "Pull Requests"`: the list heading (`../client/messages/en/prReview.json:77`,
  `../client/src/app/repos/[repoId]/pulls/page.tsx:76`). The sidebar shows it on every page, the
  root too (`../client/src/vendor/ui/nav.ts:25`, `../client/src/vendor/ui/shell/NavItem.tsx:54`).

### 02 — Open a PR from the list and load its review detail

`open /`, `wait --url /pulls`, then:

- `wait --text` + `find text … click` "Add rate limiting to public API endpoints", the
  row title (`../server/src/db/seed.ts:106`, `../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:41`).
- `wait --url /pulls/482`: the row pushes `/repos/<id>/pulls/<number>`
  (`../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:35`).
- `networkidle`, then the same title again, now in the detail header
  (`../client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:54`).

### 03 — Agents list renders the seeded reviewer agents

`open /agents`, `wait --url /agents`, `networkidle`, `wait --text "Security Reviewer"`:
the seeded agent (`../server/src/db/seed.ts:194`) in its card
(`../client/src/app/agents/_components/AgentCard/AgentCard.tsx:35`).

### 04 — PR detail shows the seeded review run, verdict, and findings

`open /`, `wait --url /pulls`, click the PR title, `wait --url /pulls/482`, `networkidle`, then:

- `find role button click --name "Agent runs"`: the tab label
  (`../client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:117`),
  a `<button>` that also holds the findings count (`../client/src/vendor/ui/kit/Tabs.tsx:25-50`).
- `wait --url tab=findings`: the key goes into `?tab` via `router.replace`
  (`../client/src/app/repos/[repoId]/pulls/[number]/page.tsx:60-68`).
- `wait --text "request changes"`: the accordion badge, the verdict enum with `_`
  replaced (`../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:92-95`).
  Not a message; the banner below says "Request changes" (`../client/messages/en/prReview.json:22`).
- `wait --text "2 findings"`: the accordion header, pluralised in TSX
  (`../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:97-100`);
  the banner repeats it (`../client/messages/en/prReview.json:25`).
- `wait --text "Hardcoded Stripe secret key in commit"`: the FindingCard title
  (`../client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:62`);
  no click, the newest accordion opens by default (`../client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:170-175`).

### 05 — PR detail Files changed tab renders the seeded diff

Same path to `/pulls/482` as 04, then:

- `find role button click --name "Files changed"`, then `wait --url tab=diff`
  (`../client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:118`).
- `wait --text "src/config.ts"`: the diff viewer's file header
  (`../client/src/components/diff-viewer/FileCard/FileCard.tsx:61`) over `pr.files`
  (`../client/src/app/repos/[repoId]/pulls/[number]/page.tsx:165-168`); without GitHub
  the API serves the seeded `pr_files` (`../server/src/modules/pulls/routes.ts:253-256`).

### 06 — Onboarding add-repository screen renders

`open /onboarding`, `wait --url /onboarding`, then `wait --text "Add a repository"`
(heading) and `"Repository URL"` (field label), both hardcoded
(`../client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94`). Never
submits. The root empty state also says "Add a repository" (`../client/src/app/page.tsx:34`).

### 07 — Settings renders the API Keys and Feature Models sections

`open /settings/api-keys`, `wait --url`, `networkidle`, `wait --text "API Keys"`; then
`open /settings/models`, `wait --url`, `wait --text "Feature Models"`. Section titles:
`../client/messages/en/settings.json:6,24`. The vendored list (`../client/src/vendor/ui/nav.ts:40-41`)
puts the same labels in the settings nav and breadcrumb (`../client/src/app/settings/[section]/_components/SettingsView/SettingsView.tsx:24,28-35`),
so the text passes even if a section body fails to render.

## Copy and URLs that must not change

| String / URL fragment | Flows | Lives in |
| --------------------- | ----- | -------- |
| `/pulls` | 01, 02, 04, 05 | route `../client/src/app/repos/[repoId]/pulls/`; redirect `../client/src/app/page.tsx:17` |
| `/pulls/482` | 02, 04, 05 | `../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:35` + seed PR number `../server/src/db/seed.ts:105` |
| `tab=findings`, `tab=diff` | 04, 05 | hardcoded tab keys, `../client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:117-118` |
| `/agents`, `/onboarding`, `/settings/api-keys`, `/settings/models` | 03, 06, 07 | app routes; section keys vendored, `../client/src/vendor/ui/nav.ts:40-41` |
| Pull Requests | 01 | messages, `../client/messages/en/prReview.json:77` (also vendored `../client/src/vendor/ui/nav.ts:25`) |
| Add rate limiting to public API endpoints | 02, 04, 05 | seed, `../server/src/db/seed.ts:106` |
| Agent runs · Files changed (button names) | 04 · 05 | hardcoded TSX, `../client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:117-118` |
| request changes | 04 | seed verdict `../server/src/db/seed.ts:142`, formatted in `../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:94` |
| 2 findings | 04 | hardcoded TSX `../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:98` over the seed's two findings |
| Hardcoded Stripe secret key in commit | 04 | seed, `../server/src/db/seed.ts:158` |
| src/config.ts | 05 | seed, `../server/src/db/seed.ts:123` |
| Security Reviewer | 03 | seed, `../server/src/db/seed.ts:194` |
| Add a repository · Repository URL | 06 | hardcoded TSX, `../client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94` |
| API Keys · Feature Models | 07 | messages `../client/messages/en/settings.json:6,24` + vendored `../client/src/vendor/ui/nav.ts:40-41` |

## Rules for new flows

- **Read-only against the seed.** No submit, create, delete or re-run. The accordion's
  delete button (`../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:117-126`)
  would remove a review that re-seeding does not restore (`../server/src/db/seed.ts:99`).
- **No model calls.** The seeded agents run on OpenRouter (`../server/src/db/seed.ts:12-13`),
  and a finished run stores the head SHA as `last_reviewed_sha`
  (`../server/src/modules/reviews/run-executor.ts:232-234`,
  `../server/src/modules/reviews/repository/pull.repo.ts:40-45`). #482 then reads
  `reviewed` or `stale` (`../server/src/modules/pulls/status.ts:51-54`) and leaves the default
  `?status=needs_review` list, which breaks 02, 04 and 05.
- **Deterministic locators only**: `--url`, `--text`, `find role|text|label`, never
  `chat` (`README.md:32-33`). Start with `open`, and put a `wait --url` before any text
  the sidebar, settings nav or breadcrumb also shows.
- **Next free number is `08`**: `08-<kebab>.flow.json` with a sentence `name`
  (`CLAUDE.md:31-32`). Add its section and table rows here in the same change;
  verify with `npm run e2e:hermetic`.
