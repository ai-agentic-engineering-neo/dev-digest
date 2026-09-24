# 05 — Intent layer (client)

Server half + API: [`server/specs/05-intent-layer.md`](../../server/specs/05-intent-layer.md).
Design reference: PR Overview → Intent card (confidence badge, sources,
"inferred" hint, refresh button); FindingCard → "Out of scope" badge.
Status: **in progress** (2026-09-24).

## Screen changes

### Overview tab (`OverviewTab`)

- Renders an `IntentCard` above the PR description (a repo's PR description can
  be empty; the tab no longer returns `null` in that case — it shows at least
  the Intent card, deriving on first view when nothing is cached yet).
- `IntentCard`:
  - Plain-text intent sentence.
  - `change_type` chip (e.g. "feature", "bugfix" — `intent.changeType.<type>`).
  - Confidence badge: `high` (green) / `medium` (amber) / `low` (muted).
  - "Inferred" hint when `derived_from === 'inferred'` (no substantive body or
    linked ticket/doc — the intent was guessed from commits/branch/paths).
  - "Stale" hint when `stale === true` (the PR body changed since this intent
    was derived) — the Refresh button doubles as the fix.
  - In-scope / out-of-scope bullet lists.
  - Sources list: one row per `sources[]` entry — kind icon, `ref`, status
    (`used` / `truncated` / `skipped` / `failed` with the reason), and a link
    built client-side (`githubIssueUrl` for tickets, `githubBlobUrl` for docs)
    — never a server-echoed URL.
  - Model + cost footer (`model`, `formatUsd(cost_usd)`).
  - **Refresh** button → `POST /pulls/:id/intent/refresh` (disabled while
    pending; shows a spinner).
  - Empty state (no intent derived yet, e.g. before the first review ran):
    title/body + **Derive now** CTA, same refresh mutation.

### Findings (`FindingCard`)

- An "Out of scope" badge next to the category tag when `finding.out_of_scope
  === true`. On a CRITICAL finding the badge carries a tooltip: "Reported
  regardless of scope" — the badge is informational only, it never implies the
  finding was hidden or downweighted.

### Run trace (`RunTraceDrawer` → `TraceBody`)

- A `PromptBlock` for the intent section (`trace.prompt_assembly.intent`),
  rendered next to the other dynamic prompt blocks (specs, callers, repo map)
  when non-null — same collapse/copy/fullscreen affordances.

## Hooks (`src/lib/hooks/intent.ts`, keys in `keys.ts`)

- `prKeys.intent(prId)` nested under `prKeys.detail(prId)`; added to
  `RUN_SCOPED_PR_KEYS` so a finished run's SSE `onFinish` refetches the intent
  too (a review may have derived or refreshed it).
- `usePrIntent(prId)` — `GET /pulls/:id/intent`.
- `useRefreshIntent(prId)` — `POST /pulls/:id/intent/refresh`; invalidates
  `prKeys.intent(prId)` on settle.

## `lib/github-urls.ts`

- `githubIssueUrl(repoFullName, number)` → `https://github.com/{repo}/issues/{n}`,
  used for `ticket` sources (built from the PR's own repo, never a
  server-supplied URL — same rule as `githubBlobUrl`/`githubPrUrl`).

## i18n

Every new string goes in `messages/en/prReview.json` under `intent.*`
(card labels, confidence levels, change types, source kinds/statuses, empty
state) and `finding.outOfScope*` for the badge; `runs.json` gets
`trace.prompt.intent` for the trace block label.

## Acceptance criteria

1. A PR whose review has derived an intent shows the Intent card with its
   text, change-type chip, confidence badge and sources — no server-echoed
   URLs, all links built from `repoFullName`/`headSha` already loaded by the
   PR detail screen.
2. Before any review has run, the Overview tab shows the Intent card's empty
   state with a **Derive now** CTA (instead of returning nothing when the PR
   body is also empty).
3. Refresh re-fetches and updates the card without a full page reload.
4. A finding flagged `out_of_scope` shows the badge in both the findings list
   and inside the run trace's Findings section; a CRITICAL one still renders
   with its full severity styling.
5. The trace drawer's Prompt assembly section shows the intent block only when
   the run actually had one (kill switch off, or intent unavailable on that
   run → the block is simply absent, matching every other optional slot).
