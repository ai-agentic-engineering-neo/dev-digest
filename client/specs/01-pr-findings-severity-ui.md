# 01 — PR findings severity UI (pills, filter, timeline icons, list popover)

## What

Four surfaces over the findings' `severity` field (`CRITICAL | WARNING | SUGGESTION`):

1. **Review-runs severity pills** — inside an expanded run card on the PR page
   (Agent runs tab → Review runs), directly under the VerdictBanner / PR SCORE:
   a row «N CRITICAL · N WARNING · N SUGGESTION».
2. **Severity filter** — clicking a pill shows only that severity's finding
   cards below; clicking the same pill again restores the full list
   (single-select toggle, `aria-pressed`).
3. **Timeline severity icons** — each settled run tile in the Timeline section
   shows compact severity icon+count pills. Display-only, never clickable.
4. **PR-list FINDINGS column** — a per-row column of compact severity pills
   with a hover popover titled «N FINDINGS IN THIS RUN» listing that PR's
   latest-round findings read-only (severity icon, title, category,
   file:line, % confidence, 2-line-clamped rationale — **no buttons**).

## Must

- Pills only appear for severities that actually exist (count > 0).
- A pill's count always equals the finding cards of that severity rendered
  below it — counts group the confidence-filtered set, so they stay true with
  "Hide low confidence" on.
- Counts are a pure client-side group-by (`src/lib/severity.ts`
  `countBySeverity`) of already-fetched findings. No new fetches, no LLM.
- Timeline pills are non-interactive; clicking anything else on a tile keeps
  its existing behavior (agent name → accordion, Trace → drawer).
- The list popover is read-only: no Accept/Dismiss there — actions live only
  on the PR detail page's finding cards.
- Popover opens on hover intent (~100ms) and keyboard focus, closes on leave
  (~140ms, cancelled by entering the popover) and Escape. It is
  **viewport-anchored (`position: fixed`)**, placed below/above the cell
  toward the roomier side — the table card's `overflow: hidden` clips any
  absolutely-positioned popover on short tables. The header stays pinned; only
  the finding list scrolls (`overscroll-behavior: contain` so wheel-at-end
  doesn't chain to the page). Scrolling inside the popover never closes it;
  page scrolling re-anchors it to its row, and it closes once the row leaves
  the viewport.

## Why

- The pills answer "how bad is this run?" before reading a single card, and
  the click-to-filter drill-down replaces mental filtering on noisy runs.
- Single-select (not multi-toggle) matches the grading criterion and the
  natural question "show me just the critical ones".
- List rows ship *previews* (`FindingPreview`), not full records: the popover
  needs a fifth of the fields, and actions belong to the detail page.
- Latest-round semantics (server-side) mirror `cost_usd`, so the FINDINGS
  column, the Cost column, and the detail page's newest state agree.

## Where

- `src/lib/severity.ts` — `countBySeverity`, `SEVERITY_KEYS`.
- `pulls/[number]/_components/FindingsPanel/` — pills + filter state.
- `pulls/[number]/_components/FindingsTab/` + `RunHistory/` — per-run tallies.
- `pulls/_components/FindingsCell/` — list column cell + popover.
- i18n keys: `prReview.panel.severityFilter*`, `prReview.list.columns.findings`,
  `prReview.list.findingsCell.*`.
