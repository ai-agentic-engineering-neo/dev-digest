# Smart Diff — client

Server half (endpoint, classifier, contract): [../../server/specs/smart-diff.md](../../server/specs/smart-diff.md).

## Goal

The PR page's **Files changed** tab shows the diff in five role groups (core → tests → wiring → docs →
boilerplate), each with its own color and description, and shows the findings of each agent's latest
review **inside the diff**: a counter per group, a dot + severity counters per file and a finding card
under the flagged line with Accept/Dismiss. A toggle switches back to GitHub's original order.

## Scope

- Data (tokens note): `usePrRuns(prId)` (key `["pr-runs", prId]`, already used by the page).
- Data: `GET /pulls/:id/smart-diff` via a new `useSmartDiff(prId)` hook (`src/lib/hooks/`, query key
  `["smart-diff", prId]`), the `files: PrFile[]` (patches) `DiffTab` already receives from the page, and
  `usePrReviews(prId)` (same `["reviews", prId]` key the page uses → cached) for the finding records.
  `["smart-diff", prId]` is invalidated wherever `["reviews", prId]` is (Run review, Accept/Dismiss,
  delete run).
- Findings shown = the **latest `kind: 'review'` review of each agent** (group by `agent_id`, newest
  `created_at`), merged; same rule as the server. A pure helper (e.g. `latestReviewsPerAgent`) with a
  unit test. Counters/dots count **non-dismissed** findings; dismissed ones keep a muted card.
- `DiffTab` (`src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/`) renders the groups; the
  existing `DiffViewer` / `FileCard` / `CodeLine` (`src/components/diff-viewer/`) gain an optional
  findings input next to `commenting` — they still work without it.
- Line anchoring: key `RIGHT:${start_line}`, partitioned like `keysForLine` / `partitionThreads`
  (`src/components/diff-viewer/comments.ts`); rendered by `CodeLine` under the line.
- Card: the existing `FindingCard` (`src/components/finding-card/`) or a smaller inline variant —
  severity, title, rationale, Accept/Dismiss via `useFindingAction()`.
- Severity visuals: line bar / dot color from `SEV_COLOR` / `SEV_COLOR_FALLBACK`
  (`src/components/finding-card/constants.ts`); icon + count via `SeverityBadge`
  (`src/vendor/ui/primitives/Badge.tsx`, `count` prop). Line label: CRITICAL → "blocker",
  WARNING → "warning", SUGGESTION → "suggestion".
- Group colors — existing CSS vars only (css-vars guard; no new tokens):

| Group | Color (var) | Description |
|---|---|---|
| core | blue `--viz-1` | The substance of the change — review closely |
| tests | purple-ish `--viz-5` (no purple token exists) | Test files and fixtures |
| wiring | amber `--viz-4` | Hooks the core into the app |
| docs | teal `--viz-3` | Documentation and licensing |
| boilerplate | grey `--text-muted` | Generated / mechanical — skim |

- Strings in `messages/en/prReview.json` → `smartDiff` (existing `coreLabel`, `wiringLabel`,
  `boilerplateLabel`, `filesCount`, `largeTitle`, `largeBody`; add `testsLabel`, `docsLabel`, the five
  descriptions and the new labels below).
- New/changed UI components are added to `/showcase` without `useTranslations` (strings as props).

## Out of scope
- Rendering `proposed_splits` contents (always `[]` this lesson).
- Findings for files not in the PR (they remain in the Findings panel).
- Translating pre-existing hard-coded `DiffTab` strings other than the ones this feature replaces.

## Acceptance criteria

### P1 — must
- **C1** Smart order (default) shows **all five groups always**, in order core → tests → wiring → docs →
  boilerplate, including empty ones ("Boilerplate · 0 files") — test with a response where 2 groups
  are empty asserts 5 headers in that order.
- **C2** Each group header: color marker, role label and description on the left; on the right
  "● N" (C5), "{count} files" and an expand/collapse-all button that opens/closes every file in the
  group.
- **C3** Default expansion: docs and boilerplate groups start collapsed; in other groups each file
  follows `AUTO_EXPAND_MAX_LINES` (`src/components/diff-viewer/constants.ts`).
- **C4** Toolbar with three controls: **Smart order** / **Original order** (flat GitHub file order =
  today's `DiffViewer`, no group headers) / **Hide findings (N)** (C10).
- **C5** Group header shows "● N" **before** "{count} files", N = number of FILES in the group with ≥ 1
  non-dismissed finding (not the number of findings); hidden when N = 0. Test: 1 file with 3 findings +
  1 clean file → "● 1".
- **C6** File card: a severity-colored dot next to the path **plus per-severity counters** (icon +
  count per severity present, e.g. critical 1, warning 2) when the file has findings; the GitHub comment
  counter (`MessageSquare` + count) stays separate and unchanged.
- **C7** Every finding whose `start_line` is a rendered `RIGHT` line renders a finding card **under that
  line** (severity, title, rationale, Accept/Dismiss) — never only a colored bar. The flagged line gets
  a colored left bar (most severe finding on it) and, at its right end, the severity icon(s) of its
  findings (`SeverityBadge` compact; label blocker / warning / suggestion as accessible text).
- **C8** Accept/Dismiss call `useFindingAction()` with the PR id; card, dots and counters reflect the new
  state without a reload.

### P2 — should
- **C9** A finding whose `start_line` is not in the patch renders in a separate block at the **end of that
  file**, not dropped.
- **C10** One "Hide findings (N)" / "Show findings (N)" toggle hides/shows finding cards **and** GitHub
  comment threads together (replaces today's comments-only toggle); **starts on "shown"**; N = number of
  **non-dismissed** findings from the latest review of each agent in the PR's files (two agents with
  5 + 3 → "Hide findings (8)"); the label is always "Hide/Show findings (N)"; the toggle is
  **disabled when N = 0**. Composing a new comment still works while hidden.
- **C11** Before the first review: no "● 0" counters, no dots; the tab shows
  "Review not run yet — findings will appear here" instead of the tokens note; all 5 groups still
  render (no model call).
- **C12** When a review exists, a note "0 new tokens · built on {tokens} from last review" is shown
  (P2 evidence: Smart Diff made no model call). `{tokens}` = Σ(`tokens_in` + `tokens_out`) of the runs
  (`usePrRuns`, matched by `run_id`) behind the latest review of each agent; runs with null tokens count
  as 0. Test: two agents' runs 1 200 + 800 → "built on 2,000"; hidden before the first review.
- **C13** After Run review completes, group counters, dots and cards update without a page reload
  (invalidation test).
- **C14** "This PR is large ({lines} changed lines)" banner (`largeTitle` / `largeBody`) renders when
  `split_suggestion.too_big` is true, with `total_lines`; not rendered when false (both pinned by tests
  with fixtures; the server sets `too_big` when `total_lines > 1000`).

### P3 — nice
- **C15** Group headers are sticky while scrolling their group.
- **C16** A finding card under a line collapses to one line (severity + title) and expands back.
- **C17** All new strings come from `prReview.smartDiff` (no literals in TSX); the css-vars guard test
  (`src/test/css-vars.test.ts`) passes.

## Demo / video constraint
The demo PR (branch `demo/smart-diff-sample`) touches **≤ 6 files** so all groups fit on screen: one
new small dependency (lock file → boilerplate), one logic change, one test, one config/barrel file.
