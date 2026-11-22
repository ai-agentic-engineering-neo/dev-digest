# M1 · Severity counters & filter — specification

Roadmap: **M1 — severity filter on findings** (root `README.md` §Roadmap).
Package: `client` only (one component on the PR page). No server change.
Plan: [PLAN.md](PLAN.md).

## 1. Problem

On the PR page, tab **Agent runs**, the reviewer's findings are grouped by run
(`ReviewRunAccordion`). To know how many of a run's findings are critical, the
user has to scroll the card list and count by eye. There is also no way to look
at one severity level only.

Everything needed is already on the client:

- `GET /pulls/:id/reviews` (`server/src/modules/reviews/routes.ts`) returns
  `ReviewRecord[]`, each with its own `findings: FindingRecord[]`.
- `usePrReviews(prId)` (`client/src/lib/hooks/reviews.ts`) loads it;
  `page.tsx` passes it as `runs` → `FindingsTab` → one `ReviewRunAccordion`
  per run → `FindingsPanel` gets that run's `findings`.
- Each finding has `severity`, the Zod enum `Severity` =
  `CRITICAL | WARNING | SUGGESTION` (`vendor/shared/contracts/findings.ts`).

## 2. Goal

In the body of an expanded run, between the `VerdictBanner` and the card list,
show one toolbar row: severity chips on the **left**, the existing
**Hide low confidence** toggle on the **right**.

```
( 1 CRITICAL ) ( 3 WARNING ) ( 1 SUGGESTION )            Hide low confidence [○]
```

Run with no CRITICAL findings (General Reviewer on the reference screenshot):

```
( 2 WARNING ) ( 2 SUGGESTION )                           Hide low confidence [○]
```

Clicking a chip keeps only that level's findings in the list. Clicking the
active chip again removes the filter.

## 3. Decisions (agreed)

| Topic | Decision |
|---|---|
| Where | Inside `FindingsPanel`, in its existing toolbar (`s.toolbar`): chips left, Hide low confidence right, same row. Not in the accordion header: its `N blockers` stays unchanged and is a different number (non-dismissed CRITICAL only). |
| Levels | Only the 3 levels of the Zod `Severity` contract, always in the order CRITICAL → WARNING → SUGGESTION. `SEV` in `@devdigest/ui` also has `INFO`; it is **not** shown. No custom levels. |
| Label format | `{count} CRITICAL`, `{count} WARNING`, `{count} SUGGESTION`: uppercase, singular always (`1 CRITICAL`, `3 WARNING`). No icon, text only. |
| Label source | `client/messages/en/prReview.json` (`panel.severity.*`). `SEV[lvl].label` (`Critical`) is not used for the text: the format needs a count and uppercase. |
| Count base | Counts are taken **after** Hide low confidence and **before** the severity filter. With the toggle on, findings below `LOW_CONFIDENCE_THRESHOLD` (0.65) are not counted. A chip always equals the number of cards of its level the list shows when that level is active. |
| Dismissed / accepted | **Counted.** Their cards stay in the list, so the numbers must include them. |
| Severity filter vs counts | The active filter does **not** change the counts. With WARNING active, CRITICAL and SUGGESTION still show their own numbers. |
| Zero level | A level with count `0` is **not rendered**. This includes a level that drops to 0 after Hide low confidence is turned on. Exception: the **active** level stays visible even at `0`, so the filter can still be removed. The list then shows the existing empty state (`panel.noMatchTitle`). |
| No findings at all | A run with no findings renders no chips (no level passes the zero rule). The toggle stays. |
| Selection | Single select: at most one active level. Click inactive → it becomes the only active one (the highlight moves). Click active → filter off. |
| Look | Pill chip (`border-radius: 999px`), colors only from `SEV` (`@devdigest/ui`), no own palette. **Inactive**: `1px solid SEV[lvl].c` border, text `SEV[lvl].c`, transparent background. **Active**: background and border `SEV[lvl].c` (filled), text `var(--bg-primary)` (no text-on-color token exists; `--bg-primary` is a token and contrasts in both themes). `SeverityBadge` itself is not reused: it always renders `CRITICAL 3` with an icon and has no inactive/active pair. |
| State visibility | The active state is a static style, not a hover effect: it's visible on a screenshot. Hover may only add a subtle change (e.g. opacity) and never looks like the active state. |
| Accessibility | `<button type="button" aria-pressed>` inside a `role="group"` with an accessible label (`panel.severity.groupLabel`). The level name is in the label text, so the state isn't conveyed by color alone (fill + `aria-pressed`). |
| Filter state | Local `useState` in `FindingsPanel`, per run. Not persisted (no URL / storage). Collapsing the accordion unmounts the panel and resets it, as with Hide low confidence today. |
| After accept / dismiss | `useFindingAction` already invalidates `["reviews", prId]` on success, so `usePrReviews` refetches, `FindingsPanel` gets new `findings` and the counts are recomputed from them (`useMemo` on `findings`). No reload, no extra code path. Since dismissed findings are counted, the numbers stay equal to the list. |
| Keyboard focus | `focusIdx` (j/k, a/d) is reset to 0 whenever the severity filter or Hide low confidence changes, so the shortcuts never target an index outside the shown list. |
| Data | Computed on the client from the already-loaded `findings`. **No** new requests, routes, tables, contract changes or model calls. |
| Untouched | Server, contracts, `FindingCard`, the `ReviewRunAccordion` header. |
| Docs location | `client/specs/m1-severity-filter/` (client-only feature). |

## 4. Behaviour

### 4.1 Pipeline

```
findings (one run)
  └─ hideLow ? drop confidence < 0.65 : keep all       → base
       ├─ countBySeverity(base)                        → chips (zero rule)
       └─ severity ? keep f.severity === severity       → filter
            └─ sort by SEVERITY_ORDER                  → cards
```

### 4.2 Scenarios

| # | State | Chips | List |
|---|---|---|---|
| B1 | 1 CRIT, 3 WARN, 1 SUGG, no filter | `1 CRITICAL` `3 WARNING` `1 SUGGESTION`, all outlined | all 5 |
| B2 | click `3 WARNING` | same numbers, WARNING filled | the 3 WARN cards |
| B3 | click `3 WARNING` again | all outlined | all 5 |
| B4 | WARNING active, click `1 CRITICAL` | CRITICAL filled, WARNING outlined | the 1 CRIT card |
| B5 | run has 0 CRIT (2 WARN, 2 SUGG) | only `2 WARNING` `2 SUGGESTION` | all 4 |
| B6 | Hide low on; 1 WARN is low-confidence | `2 WARNING` | 2 WARN when filtered |
| B7 | CRITICAL active, Hide low on, the only CRIT is low-confidence | `0 CRITICAL` stays visible and filled | existing empty state `No findings match` |
| B8 | B7, then click `0 CRITICAL` | CRITICAL chip disappears | all non-low findings |
| B9 | WARNING not active and drops to 0 after Hide low | WARNING chip not rendered | — |
| B10 | dismiss a WARNING card | numbers unchanged, list unchanged (card shows dismissed) | same |
| B11 | run with no findings | no chips | existing empty state |

### 4.3 i18n

`client/messages/en/prReview.json`, under `panel`:

```json
"severity": {
  "groupLabel": "Filter by severity",
  "CRITICAL": "{count} CRITICAL",
  "WARNING": "{count} WARNING",
  "SUGGESTION": "{count} SUGGESTION"
}
```

Keys equal the `Severity` enum values, so the label is
`t(\`panel.severity.${lvl}\`, { count })`. No ICU plural. No inline UI strings.

## 5. Out of scope

Multi-select of levels · persisting the filter (URL / storage) · a filter
across all runs of the PR · filters by category / file / confidence slider ·
icons on the chips · changing the accordion header `blockers` · changing
`FindingCard` · the `INFO` level · server, contracts, DB.

## 6. Acceptance criteria

**P1 — must**

1. An expanded run on the **Agent runs** tab shows severity chips above its
   card list.
2. Each number equals the number of cards of that level in this run's list.
3. Clicking a level keeps only that level's findings.
4. Clicking the active level again removes the filter and returns the full list.

**P2**

5. Counts come from the already-loaded `findings`: no server requests, no
   model calls.
6. The severity filter and Hide low confidence apply together (both
   conditions at once); counts follow Hide low confidence.
7. Colors come from `SEV` (`@devdigest/ui`), no own palette.
8. Tests for counting and filtering, following `FindingsPanel.test.tsx`;
   `pnpm test` and `pnpm typecheck` in `client/` are green.
9. A `client/INSIGHTS.md` entry via `engineering-insights` at the end.

**P3**

10. At most one level is active; clicking another moves the highlight.
11. The active state doesn't depend on hover; it's visible on a screenshot.
12. When nothing is left after the filters, the existing `EmptyState` shows.
13. Labels live in `client/messages/en/prReview.json`, not in code.
14. After accept or dismiss, the counts match the list without a reload.

**Layout (from the reference screenshots)**

15. Chips left, Hide low confidence right, in one row; order always
    CRITICAL → WARNING → SUGGESTION; uppercase singular labels.
16. Inactive chip: border and text in its `SEV` color. Active chip: filled
    with its `SEV` color.
17. A level with 0 findings is not shown, except the active one.

## 7. Open questions

None.
