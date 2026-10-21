# Flow contract and coverage

This folder holds the flow files themselves (`NN-name.flow.json`), not feature
specs. This document is the contract every flow must satisfy, followed by one
section per existing flow: the journey, the exact seeded facts it depends on,
the locators it uses, and what change in the app would break it. How the runner
executes a flow is in `../docs/runner.md`.

## Global rules

- Deterministic locators only: `wait --url`, `wait --text`, `wait --load`,
  `find text ... click`, `find role button click --name ...`. The AI `chat`
  command is banned.
- No model calls. Nothing a flow does starts a review run, so no API key is
  needed and the CI job sets none.
- No writes that change seeded data. Flows navigate, click tabs and rows, and
  open a drawer. Flow 06 renders the add-repository form but never submits it.
- Every flow must pass on the hermetic stack (`./scripts/e2e.sh`): a fresh,
  seeded DB where `acme/payments-api` is the only repo. That is also what CI
  runs against.
- Each flow is self-contained: it starts with its own `open`, because a failed
  step in one flow skips the rest of that flow but the next flow still runs.

## Contract for one flow

| Requirement | Why |
|---|---|
| File named `NN-name.flow.json`, next free `NN` | The runner sorts by filename; the prefix is the run order |
| `name` set; `description` states journey, seeded assumptions and the components exercised | The name is what the PASS/FAIL summary prints |
| Every `steps[].cmd` is a valid agent-browser argv; `{BASE}` is the only placeholder | Args are passed verbatim to the CLI |
| Every step has a `label` | The label is the log line and the failure line |
| Assert on rendered text or URL fragments that come from the seed or from static UI strings | Anything else is non-deterministic |
| A `wait --load networkidle` before asserting on fetched data | Avoids racing the initial fetch |
| A row in the coverage table in `../README.md` and a section here | Keeps coverage visible |

## Seeded facts the flows rely on

All from `server/src/db/seed.ts` unless noted.

| Fact | Value |
|---|---|
| Repo | `acme/payments-api`, default branch `main`, the only repo |
| PR | number 482, title `Add rate limiting to public API endpoints`, author `marisa.koch`, 9 files |
| PR files | 9, at least one per Smart Diff role: core `src/middleware/ratelimit.ts`, `src/api/public/webhooks.ts`, `src/api/users.ts`; wiring `src/config.ts`, `src/server.ts`, `package.json`; tests `test/ratelimit.test.ts`; docs `docs/rate-limiting.md`; boilerplate `package-lock.json`. Only `src/config.ts` has a patch (new line 12 `stripeKey: "STRIPE_KEY_PLACEHOLDER"`) |
| Review | kind `review`, verdict `request_changes`, score 61, model `seed` |
| Findings | 2: `Hardcoded Stripe secret key in commit` (CRITICAL, `src/config.ts:12`) and `N+1 query in user list endpoint` (WARNING, `src/api/users.ts:45-52`) |
| Agent run | status `done`, tokens_in 8190, tokens_out 929, cost_usd 0.0013, duration 8200 ms, linked to the review by `runId` |
| Agents | `General Reviewer`, `Security Reviewer`, `Performance Reviewer`, all enabled |
| Cost badge text | `9,119 tok · $0.0013` (8190 + 929 formatted by `client/src/lib/format-cost.ts`) |

## 01-app-boot

Journey: `open {BASE}/`, wait for network idle, wait for `/pulls` in the URL,
wait for the text `Pull Requests`.

Seeded facts: at least one repo exists. The root page
(`client/src/app/page.tsx`) calls `useRepos()` and redirects to
`/repos/<repos[0].id>/pulls` only when the list is non-empty; zero repos shows
an empty state instead, so reaching `/pulls` proves client, API and DB are up.

Locators: `wait --url /pulls`; `wait --text "Pull Requests"`, the `list.title`
string in `client/messages/en/prReview.json` rendered as the `<h1>` of
`client/src/app/repos/[repoId]/pulls/page.tsx`.

Breaks if: the root stops redirecting, the PR list route moves off `/pulls`,
or the list heading is renamed.

## 02-repo-pulls-detail

Journey: root redirect to the PR list, wait for the seeded PR title, click the
row by that text, wait for `/pulls/482`, network idle, and the title again on
the detail page.

Seeded facts: the demo repo is the first repo; PR 482 with title
`Add rate limiting to public API endpoints`.

Locators: `wait --text` and `find text ... click` on the PR title;
`wait --url /pulls/482`.

Breaks if: another repo is first (the redirect lands elsewhere), the PR title
changes, the row stops being clickable by its title text, or the detail route
no longer includes the PR number.

## 03-agents

Journey: `open {BASE}/agents`, wait for the route, network idle, and the text
`Security Reviewer`.

Seeded facts: the agent named `Security Reviewer`. `AgentCard`
(`client/src/app/agents/_components/AgentCard/AgentCard.tsx`) renders
`ag.name`, and `AgentsListView` renders one card per agent.

Locators: `wait --url /agents`; `wait --text "Security Reviewer"`.

Breaks if: the agent is renamed in the seed, the agents route moves, or the
card stops rendering the name as text. This flow does not depend on the redirect.

## 04-pr-findings

Journey: root redirect, click the PR row, wait for `/pulls/482` and network
idle, click the `Agent runs` tab, wait for `tab=findings` in the URL, then the
texts `request changes`, `2 findings` and `Hardcoded Stripe secret key in commit`.

Seeded facts: PR 482 first in the list; the seeded review with verdict
`request_changes` and exactly two findings; the CRITICAL finding's title.

Locators: `find role button click --name "Agent runs"` (tab label hardcoded in
`PrDetailHeader.tsx`, tab key `findings`); `wait --url tab=findings` (the
`tab` search param set in `pulls/[number]/page.tsx`);
`wait --text "request changes"` (the accordion header renders
`review.verdict.replace("_", " ")` in `ReviewRunAccordion.tsx`);
`wait --text "2 findings"` (`{findings.length} finding{s}` in the same header;
also matched by the verdict banner's `{count} findings`);
`wait --text "Hardcoded Stripe secret key in commit"` (the first run's
accordion is open because `FindingsTab.tsx` passes `defaultOpen={i === 0}`).

Breaks if: the tab is renamed or its key changes, the verdict is displayed
without the underscore replacement, the finding count or first finding title
changes in the seed, or the newest run's accordion stops opening by default.

## 05-pr-diff

Journey: root redirect, click the PR row, wait for `/pulls/482` and network
idle, click the `Files changed` tab, wait for `tab=diff`, then the text
`src/config.ts`. Then the Smart Diff: `Smart order`, the five group labels
`Core logic`, `Tests`, `Wiring`, `Docs`, `Boilerplate`, the inline finding
`Hardcoded Stripe secret key in commit` (under `src/config.ts` line 12, wiring
group open by default), and `N+1 query in user list endpoint` in the
"Findings outside the diff" block of `src/api/users.ts` (core group open).
Finally click `Original order` and wait for `src/config.ts` again. No Accept
or Reject click: flows do not write.

Seeded facts: PR 482 first in the list; nine `pr_files` covering every role;
the patch on `src/config.ts`; the seeded review's two findings. Needs a fresh
DB: an existing dev DB keeps the old four files (`seed.ts` inserts files only
when the PR row is missing).

Locators: `find role button click --name "Files changed"` (tab key `diff` in
`PrDetailHeader.tsx`); `wait --url tab=diff`; `wait --text` on the group labels
and toggle (`smartDiff` keys in `client/messages/en/prReview.json`);
`find role button click --name "Original order"`.

Breaks if: the tab label or key changes, the seeded files or the
`src/config.ts` patch change, the `smartDiff` strings in `prReview.json`
change, `server/src/modules/smart-diff/constants.ts` reclassifies a seeded
path, or the core/wiring groups stop opening by default.

## 06-onboarding

Journey: `open {BASE}/onboarding`, wait for the route, then the texts
`Add a repository` and `Repository URL`. Nothing is typed or submitted.

Seeded facts: none. Both strings are hardcoded in
`client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx` (the `<h1>`
and the `FormField` label).

Locators: `wait --url /onboarding`; two `wait --text`.

Breaks if: the heading or field label is reworded, or the route moves.

## 07-settings

Journey: `open {BASE}/settings/api-keys`, wait for the route and network idle,
then the text `API Keys`; `open {BASE}/settings/models`, wait for the route,
then the text `Feature Models`.

Seeded facts: none from the seed. Both titles are the section `title` strings
in `client/messages/en/settings.json`, rendered by `SettingsView` and
`SettingsModels`.

Locators: `wait --url /settings/api-keys`, `wait --url /settings/models`, two
`wait --text`.

Breaks if: a section slug or title changes. `API Keys` also appears in the
`noKeyNote` string of the models section, so that page would still match it.

## 08-run-cost

Journey: root redirect, wait for the PR title and the text `$0.0013` on the
list, click the row, wait for `/pulls/482` and network idle, click `Agent runs`,
wait for `tab=findings`, wait for `9,119 tok · $0.0013`, click the timeline
button named `Open run trace & logs`, then wait for `Stats`, `COST` and
`DURATION`.

Seeded facts: the one completed run linked to PR 482's review with
tokens_in 8190, tokens_out 929 and cost_usd 0.0013. The seed inserts this run
only while the seeded review has no `runId` yet, so it exists on a fresh DB.

Locators: `wait --text "$0.0013"` (the compact `RunCostBadge` in
`PRRow.tsx`, fed by `pr.cost_usd`); `wait --text "9,119 tok · $0.0013"` (the
full badge in `RunHistory.tsx` and `ReviewRunAccordion.tsx`, rendered only when
the run is settled or `done`); `find role button click --name "Open run trace &
logs"` (the `timeline.openTrace` string in `prReview.json`, used as
`aria-label` on the timeline icon button in `RunHistory.tsx`);
`wait --text Stats|COST|DURATION` (`trace.stats`, `trace.stat.cost` and
`trace.stat.duration` in `client/messages/en/runs.json`, rendered by
`TraceBody.tsx`).

Breaks if: `formatCost` or `formatTokenTotal` change their output for 0.0013 or
9119, the PR list drops the COST column, the badge separator ` · ` changes, the
icon button's accessible name changes, the trace drawer stat labels change
case, or the seed's token or cost numbers change.

## 09-findings-severity

Journey: root → PR list → PR #482 → Agent runs tab → the first Review run card
(open by default) → click the Warning filter → click it again.

Seeded facts: the seeded review has exactly two findings, one CRITICAL
(`Hardcoded Stripe secret key in commit`) and one WARNING (`N+1 query in user
list endpoint`), so the pills row reads «1 CRITICAL · 1 WARNING» with no
SUGGESTION pill, and the Warning filter leaves one card.

Locators: `wait --text` on both finding titles and on the `Accept` / `Reject`
button labels (`finding.accept` / `finding.dismiss` in `prReview.json`,
rendered by `FindingCard.tsx`); `find role button click --name "Warning"`
targets the filter `Chip` in `FindingsPanel.tsx` (accessible name is the label
plus its count). `wait --text` cannot assert absence, so the flow proves the
filter round-trips by waiting for the CRITICAL title to reappear after the
second click.

Breaks if: the seed changes the two findings' severities or titles, the filter
labels change (`panel.filter.*`), the first run stops opening by default, or
the Reject label reverts to Dismiss.

## 10-skills

Journey: `/skills` → click the `breaking-change` card → the editor opens
inline on the right (`?skill=<id>`, Config tab) → Versions tab
(`?tab=versioning`) → `/agents` → click `Security Reviewer` → Skills tab
(`?tab=skills`).

Seeded facts: `server/src/db/seed-skills.ts` seeds `pr-quality-rubric`,
`secret-leakage-gate` and `lethal-trifecta` (among others) and links exactly
those three to `Security Reviewer` (`AGENT_SKILL_LINKS`), so the tab badge
starts with «3 of». The Skills column is alphabetical and scrolls inside the
page, so the flow clicks `breaking-change`, the first card, which is always
in view; with no `?skill=` the page opens the first skill by itself, and the
click keeps that selection. The editor's Config tab shows the «Configuration»
heading. Every seeded skill has exactly one version, so the Versions tab
shows one row with the `current` badge. A card below the fold (e.g.
`secret-leakage-gate`) is not clickable with `find text … click`.

## 11-conventions

Journey: root → PR list (this sets the active repo) → sidebar **Conventions**
→ `/conventions`.

Seeded facts: `acme/payments-api` is the only repo and has no `clone_path`,
so the page shows the heading with `payments-api` and the «Repository not
cloned yet» state; no scan can start, so no model call.

Locators: `find text "Conventions" click` targets the sidebar item (the only
«Conventions» text on the PR list page); `wait --text` on «Conventions in»,
`payments-api` and the not-cloned title (`page.notCloned.title` in
`conventions.json`).

Breaks if: the nav label or the not-cloned copy changes, the seed gains a
clone path for the demo repo, or the active-repo fallback stops picking the
first repo.

## 12-pr-intent

Journey: root → PR list → click the PR #482 row → `/pulls/482` (Overview is
the default tab).

Seeded facts: `db/seed.ts` writes one `pr_intent` row for PR #482 with
confidence `medium`, the intent «Protect the public API from abuse … token-bucket
rate limiter …», a used `github_issue` source `#471` and a skipped
`external_url` source with reason `external_fetch_disabled`. Its source hash
uses the registry default model, so the card is not shown as stale. No model
call is made.

Locators: `wait --text` on «Medium confidence» (`intent.confidence.medium` in
`intent.json`), «token-bucket rate limiter», `#471` and «external links are not
fetched» (`intent.reason.external_fetch_disabled`).

Breaks if: the seeded intent row, its text or sources change, the
`review_intent` default model changes without re-seeding (the card would still
render, only with a Stale badge), the Overview tab stops being the default, or
the confidence or reason copy changes.


## 13-pr-blast-radius

Journey: root → PR list → click the PR #482 row → `/pulls/482` (Overview is
the default tab).

Seeded facts: the seeded repo has no `clone_path` and no `repo_index_state`
row, so `GET /pulls/:id/blast` answers `degraded: true, reason: "no_data"`
with no symbols and no callers. The Blast radius card renders its empty state
instead of the stat row. No model call is made.

Locators: `wait --text` on «No impact map yet» (`blast.empty.title`), «not
indexed yet» (`blast.empty.no_data`) and «Rebuild index» (`blast.rebuild`). The
card label «Blast radius» is not a locator: it is rendered through CSS
`text-transform: uppercase`, which `wait --text` sees as «BLAST RADIUS».

Breaks if: the seed starts cloning or indexing the demo repo (the card would
show a map instead), the Overview tab stops being the default, or the empty
state copy changes.


## 16-pr-brief

Journey: root → PR list → click the PR #482 row → `/pulls/482` (Overview) →
reload → click the «Hard-coded secret key» focus row → Files changed
(`?tab=diff&file=src/config.ts&line=12`) → back to Overview → click the cost
line → run trace drawer.

Precondition: the seeded `acme/payments-api` only. `db/seed.ts` writes one brief
run with trace and one stored `pr_brief` for PR #482 (summary «Adds a
token-bucket rate limiter to the public API», a Risk areas chip «Secret key
committed in config», a Review focus row «Hard-coded secret key» at
`src/config.ts:12`, tokens 8.2K→1.3K) next to the seeded review with the
«Request changes» verdict. Nothing generates a brief, so no model call is made
and nothing is written.

Locators: `wait --text` on the summary, «Request changes», the chip title,
«Hard-coded secret key», «8.2K→1.3K», «rateLimitMax» (the opened patch) and
«PR Brief» (trace drawer title); `wait --url` on `tab=diff`, `line=12` and
`trace=`. The focus row and the cost line sit below the fold, so an `eval`
`scrollIntoView` precedes each click.

Breaks if: the seeded brief, its run or its review change, the seeded priced run
set changes (the cost line), the Intent card or brief card order changes (the
scroll steps), or the copy in `messages/en/brief.json` changes.


## 15-onboarding-tour

Journey: `/agents` → sidebar «Onboarding Tour» → `/repos/<id>/tour`.

Seeded facts: `db/seed.ts` stores one five-section tour for `acme/payments-api`
(commands `pnpm install`, `docker compose up -d postgres redis`, `pnpm dev`).
The repo has no `clone_path`, so with a stored tour the page shows the tour and
the «Repository not cloned yet» note in place of the Regenerate button. The
flow makes no model call and writes nothing.

Locators: `find text "Onboarding Tour"` for the sidebar item (`find role link`
does not match sidebar items); `wait --text` on «Onboarding for»,
«Architecture overview», «How to run locally», «First tasks», «pnpm dev» and
«Repository not cloned yet». «ON THIS PAGE» is not a locator: it is rendered
through CSS `text-transform: uppercase`.

Breaks if: the seeded onboarding row or its commands change, the seeded repo
gets a clone (the Regenerate button would replace the note), the sidebar label
changes, or the section title copy in `messages/en/onboarding.json` changes.
