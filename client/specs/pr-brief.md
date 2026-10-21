# PR Brief — client

The PR Brief card, the risk areas and the review focus card on the PR Overview
tab, and the `file` / `line` deep link into Files changed. The API half is
[`server/specs/pr-brief.md`](../../server/specs/pr-brief.md); the route contract
is in [`pages.md`](pages.md).

Spec: specs/pr-brief.md (SPEC-03)

Status: **implemented 2026-10-21**.

## Layout (`/repos/[repoId]/pulls/[number]`, Overview)

`OverviewTab` renders, inside the "PR brief" section: `PrBriefCard`, then the
two-column grid (`IntentCard` with the risk areas, `BlastRadiusCard`), then the
full-width `ReviewFocusCard` (only when a stored brief exists). The PR
description section below is unchanged. With no stored brief the grid and the
description render exactly as before.

`OverviewTab` and `PrBriefCard` both call `usePrBrief` with the same query key:
one request, one cache entry.

## Data (`src/lib/hooks/brief.ts`)

| Hook | Endpoint | Behaviour |
|---|---|---|
| `usePrBrief(prId)` | `GET /pulls/:id/brief` | key `["pr-brief", prId]`; polls every 2 s while `run.status === "running"` |
| `useGenerateBrief(prId)` | `POST /pulls/:id/brief/generate` | on success writes the returned running run into the cache, keeping the previous `brief`, `review` and `stale`, then invalidates the key |

`["pr-brief", prId]` is also invalidated when a review run settles
(`onRunDone` in `page.tsx`) and on a finding accept or dismiss
(`useFindingAction`), so the verdict, counts, score and "Out of date" badge
follow without regenerating.

## `PrBriefCard` states

| State | Shows |
|---|---|
| loading | card title and a `Skeleton` |
| GET failed | `ErrorState` "Couldn't load the brief." with Retry; the other cards still render |
| no brief, not running | a "Generate brief" primary button; its tooltip is "Writes a summary, risks and a reading order with `<provider>/<model>`" naming the workspace's current `risk_brief` model (`useSettings` + `featureModelFor`) |
| no brief, running | the button is disabled with a loading spinner and reads "Writing the brief…"; `aria-busy` is set on the card body |
| brief stored | the (i) info popover, an "Out of date" badge when `stale`, the regenerate icon button (accessible name and tooltip "Regenerate brief with `<model>`", the workspace's current model), the verdict tile, the summary, the PR SCORE ring, the cost line |
| brief stored, running | the previous brief stays; the regenerate icon is replaced by a "Writing the brief…" badge |
| latest run failed (and not running) | an inline `role="alert"` line "The last attempt failed: `<error>`" (for an invalid output the error carries the parse issues) under the previous brief, or under the Generate button when none exists; no toast |

The verdict tile and label come from `VERDICT_META`
(`pulls/[number]/constants.ts`, shared with `VerdictBanner`). Findings
(`N findings`) and blockers (`N blockers`, shown only when above zero) are two
badges next to the summary. The score ring (`CircularScore`) shows only when the
review has a score. With no review the tile is the neutral "Not reviewed yet", no
badge and no ring show, and the hint "Run a review to get a verdict and a score."
appears; the summary, risks and focus still render.

The (i) `InfoPopover` opens on hover and on focus and shows "Verdict from
`<agent>`", "Reviewed: `<time>`" and "Summary written by `<provider>/<model>`" of
the stored brief.

Cost line: `formatCost(cost_usd)` and `formatTokenPair(tokens_in, tokens_out)`
(`8.2K→1.3K`, `—` for an unknown side), joined as `<cost> · <tokens>`, from the
brief call only. It is a button when a run id exists (`brief.run_id`, else the
latest run's id) and sets `trace=<run_id>`, which opens the existing
`RunTraceDrawer`; the drawer title falls back to `config.agent`, "PR Brief".
"Based on X of Y files" shows when `files_included < files_total`. When `stale`,
the badge title and a hint line read "The PR or its review changed since this
brief was written. Regenerate to refresh it." (one text for both causes).

## Risk areas (`RiskAreas`, inside `IntentCard`)

`IntentCard` takes optional `risks` and `onOpenRef` and renders `RiskAreas`
between the scope lists and the sources disclosure. Nothing renders, no heading
included, when `risks` is empty or absent. A chip has the kind icon, the title and
a chevron (`aria-expanded`, accessible name "Show/Hide details for `<title>`");
expanded it shows the explanation and the severity badge. Each `file_refs` entry
is a monospace button ("Open `<ref>` in Files changed") that calls `onOpenRef`
with the path and the start line of the reference. Kind to icon is
`KIND_ICON` with `FALLBACK_ICON` for any stored kind outside the enum (the server now
normalises an unknown model kind to `other` before storing, so this covers only
older stored values); severity
maps `high` → `CRITICAL`, `medium` → `WARNING`, `low` → `SUGGESTION` (`RISK_SEV`)
from the `SEV` tokens.

## Review focus (`ReviewFocusCard`)

Header "Review focus — read these first" with a count badge. One button row per
item in the stored order, `path:line — reason` (`path — reason` when `line` is
null; accessible name "Open `<ref>` in Files changed"), each calling `onOpen`.
An empty list shows the note "Nothing in particular to flag. Read the diff in the
order of the Files changed tab." The card is not rendered when no brief exists.

## Deep link to Files changed

| Param | Set by | Meaning |
|---|---|---|
| `tab=diff` | `diffDeepLinkSearch` | opens Files changed |
| `file=<path>` | a focus row or a risk ref | the file to open |
| `line=<n>` | the same, when the reference has a line | the new-side line to scroll to |

`page.tsx` `openDiffAt(path, line)` makes one `router.replace` with
`diffDeepLinkSearch` (other params kept, `line` removed when null). The params
stay in the URL, so a reload reopens the same place.

`DiffTab` takes `focusFile` and `focusLine` and resolves them with
`resolveDeepLink(files, file, line)`: the path must be a changed file of the PR
(a path that is not is ignored), the line must be a positive integer. On a hit:
the owning `RoleGroup` gets `forceOpen`, the `FileCard` gets `forceOpen`
(both open through an effect, so a collapsed group or file expands), and
`useDiffDeepLink` runs once per `(path, line)`: it waits up to 60 animation
frames for `[data-diff-path]`, scrolls the file card, or the `[data-line]` row
inside it when `line` is rendered, into view, and tints that line for 2 seconds
(`var(--accent-bg)`, `CodeLine` `highlighted`). New-side lines carry
`data-line`; deleted lines do not. A miss (unknown file, line not rendered)
opens the tab normally with no error and no toast. `DiffViewer`, `FileCard` and
`CodeLine` take the focus props as optional props; existing callers are
unchanged.

## Strings and styling

All strings are in `messages/en/brief.json` (namespaces `brief.card`,
`brief.risks`, `brief.focus`, camelCase keys). Styles are inline objects in each
component's `styles.ts` with CSS variables and `SEV` tokens only. Model text
(summary, titles, explanations, reasons) is rendered as plain text.

## Tests and e2e

Component tests: `PrBriefCard.test.tsx`, `RiskAreas.test.tsx`,
`ReviewFocusCard.test.tsx`, `IntentCard.test.tsx` (risks only when present),
`OverviewTab/helpers.test.ts`, `pulls/[number]/helpers.test.ts`,
`DiffTab/helpers.test.ts` (`resolveDeepLink`), `useDiffDeepLink.test.tsx`,
`RoleGroup.test.tsx` (`forceOpen`), `lib/format-cost.test.ts`
(`formatTokenPair`). Browser flow: `16-pr-brief` (seeded brief, reload, focus row
deep link, cost line opens the trace); it makes no model call.
