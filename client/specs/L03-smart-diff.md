# Smart Order (client)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `server/` and `client/`, so it keeps **one** spec:
[../../server/specs/L03-smart-diff.md](../../server/specs/L03-smart-diff.md) —
goal, non-goals, the route, the classifier table, the "latest review per
agent" rule and the server-side acceptance criteria all live there.

This file records only what is client-specific.

## UI surface

- **`DiffTab`** (route-local, `app/repos/[repoId]/pulls/[number]/_components/DiffTab/`)
  gains an order toggle (two `Chip`s, "Smart order" / "Original order") next
  to its `SectionLabel`. Smart is the default; `?order=original` switches to
  GitHub's original order. The mode lives in the URL, exactly like the
  page's existing `tab` and `trace` params — never in local `useState`.
- **`useSmartDiff(prId)`** (`lib/hooks/smart-diff.ts`) fetches
  `GET /pulls/:id/smart-diff`, key `["smart-diff", prId]`, enabled only in
  Smart mode (Original never needs it).
- **Groups.** `SmartOrderView` renders one `FileGroup` per non-empty role, in
  order core → tests → wiring → docs → boilerplate. A group header shows a
  chevron, a role-colored square, a label + description, per-severity chips
  (files-with-CRITICAL / WARNING / SUGGESTION counts — INFO has no chip, it
  isn't in the `Severity` contract) and "N files". All groups start open
  except boilerplate. Chips count **files** (a file with two WARNING
  findings counts once in the WARNING chip), not findings, and stay visible
  whether the group is open or collapsed.
- **Finding markers are sourced only from `usePrReviews`**, through one pure
  function (`findingsByFile` in `DiffTab/helpers.ts`) applying the same
  "latest review per agent" rule as the server (shared fixture, Test brief
  TP-1). The server's `finding_lines` field exists for contract truthfulness
  but the UI never reads it — this is the single-source-of-truth decision
  that rules out any drift between the file dot, the group chips and the
  inline finding cards.
- **File card:** a colored dot (highest active-finding severity) right after
  the path, shown only when the file has at least one non-dismissed finding;
  the existing GitHub-comment counter stays a separate element.
- **Code line:** a 3px left stripe + a clickable severity badge on the right
  — the `SEV` icon and word ("blocker" / "warning" / "suggestion", `+N` when
  several) in a pill with the severity's border and `SEV[…].bg` background,
  `aria-expanded`. Under a line with an active finding the inline cards are
  OPEN by default; the badge toggles them and each card's ✕ collapses them.
  The card is `InlineFindingCard` (`DiffTab/_components/`, passed via the
  `DiffFindingApi.Card` slot — `diff-viewer` never imports route-local code;
  the Agent runs tab keeps its collapsible `FindingCard`): severity tile +
  word, title, category, "line N-M", confidence, markdown rationale, a
  "Suggested fix" box, Accept/Dismiss. Only active (non-dismissed) findings
  drive the stripe/badge color and auto-expand; a line with only dismissed
  findings shows a muted stripe/badge and starts collapsed.
- **Unanchored findings:** a file whose finding doesn't land on a rendered
  RIGHT line (deleted file, `patch: null`, or `start_line` outside the
  rendered hunks) shows that finding in a collapsed block under the file,
  never attached to the nearest line.
- **Auto-expand:** a file starts expanded when its diff is ≤ 200 lines
  (`AUTO_EXPAND_MAX_LINES`) or it has an active finding. `DiffTab` therefore
  waits for `usePrReviews` to settle (showing a `Skeleton`) before mounting
  the diff viewer, so this initial state is correct on first render.
- **`showComments`** only hides GitHub comment threads; finding markers and
  cards are unaffected by it.
- **Smart-diff errors/loading:** pending → `Skeleton`; error →
  `smartDiff.unavailable` text plus the file list in original order. A file
  present in `PrDetail.files` but absent from the smart-diff response is
  treated as `core` ("everything else" rule).
- **Large-PR banner:** shown only in Smart mode, only when `too_big`, with
  `smartDiff.largeTitle` (`{lines}` = `total_lines`) and the existing
  `largeBody` text (unchanged — its trailing colon with an always-empty
  split list is a known, accepted rough edge for this iteration).

## Non-goals (client-specific)

- New locales — only `client/messages/en` exists.
- Linking the inline finding card to GitHub (no `repoFullName` /
  `headSha` available in `DiffTab`) — accepted.

## Acceptance criteria

See the server spec for the route-level criteria. Client-facing:

- [ ] Without `?order`, the tab shows Smart order; with `?order=original`,
      files render in exactly `PrDetail.files` order.
- [ ] The boilerplate group starts collapsed, the rest start expanded;
      clicking a group header toggles its files' visibility; chips and
      "N files" stay visible in both states.
- [ ] A file with both a CRITICAL and a WARNING finding counts in both
      severity chips; two WARNINGs in one file count once in the WARNING
      chip.
- [ ] The file dot appears only for a file with an active finding, colored
      by the highest such severity; the comment counter stays separate.
- [ ] Line badge text: CRITICAL → "blocker", WARNING → "warning", SUGGESTION
      → "suggestion", with the severity icon, border and background. Under a
      line with an active finding the inline card (title, rationale,
      suggestion, Accept/Dismiss) is open on load; clicking the badge or the
      card's ✕ closes it, clicking the badge again reopens it. A line with
      only dismissed findings starts collapsed.
- [ ] A finding whose `start_line` isn't among the rendered RIGHT lines (or
      whose file has `patch: null`) appears only in the unanchored block, with
      no line label anywhere.
- [ ] `showComments = false` does not hide finding labels/cards.
- [ ] Accept/Dismiss in the inline card POSTs and invalidates
      `["reviews", prId]` and `["smart-diff", prId]`; after Dismiss, a file
      loses its dot once it has no remaining active findings.
- [ ] Finding markers work identically in both Smart and Original order.
- [ ] A smart-diff request error shows "Smart order is unavailable — showing
      the original order." and falls back to original order.

## Test plan

This iteration ships the implementation only; test files are written by
test-writer from this spec and the plan's per-work-package "Tests" lines.

| Command | Needs Docker? | Covers |
|---|---|---|
| `pnpm typecheck` | no | types across all new/changed files |
| `pnpm test` | no | `lib/severity.ts`, `useSmartDiff`/`useFindingAction` invalidation, diff-viewer finding markers, `DiffTab` helpers + component |
