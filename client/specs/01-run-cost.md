# 01 — Run cost (client)

Data/API half: [`server/specs/01-run-cost.md`](../../server/specs/01-run-cost.md).
That spec defines what `cost_usd` means on `PrMeta`, `RunSummary`, `RunStats` and
`ReviewRecord`. It covers failed and cancelled runs too: they now carry real tokens
and cost.

## Goal

Show what reviews cost on five surfaces from the design
(`design/DevDigest Design (standalone).html`):

| # | Screen | What | Source field |
|---|---|---|---|
| 1 | PR list `/repos/:repoId/pulls` | New **COST** column: total of all runs of the PR | `PrMeta.cost_usd` |
| 2 | PR page → Agent runs timeline | Under the run time: `9,119 tok · $0.0013` | `RunSummary.tokens_in/out`, `.cost_usd` |
| 3 | Agent run drawer → Stats | **COST** stat between TOKENS and FINDINGS | `RunTrace.stats.cost_usd` |
| 4 | PR page → review accordion header | Cost between the score and the time | `ReviewRecord.cost_usd` |
| 5 | Verdict banner (inside the accordion) | Under PR SCORE: `$ $0.014  1.2k→0.9k` | `ReviewRecord.cost_usd`, `.tokens_in/out` |

## Formatting: one rule everywhere

The design uses three different formats (`$0.014`, `$0.0013`, `$0.06`). We use one
helper, `formatUsd(usd)`, on every surface:

| Input | Output | Rule |
|---|---|---|
| `null` / `undefined` | `—` | unknown (unpriced model, pre-migration run) |
| `0` | `$0.00` | free model, or a run that failed before any LLM call |
| `0.00004` | `<$0.0001` | below display floor |
| `0.0013` | `$0.0013` | < $1: 2 significant digits … |
| `0.014` | `$0.014` | |
| `0.06` | `$0.06` | … trailing zeros trimmed down to 2 decimals |
| `0.1` | `$0.10` | |
| `1.2345` | `$1.23` | ≥ $1: 2 decimals |

The `title` tooltip holds the exact value (`$0.001312`) wherever the value is shown in a `CostText`.

## UI components: what and where

New shared pieces:

- `src/lib/format-usage.ts` (+ `format-usage.test.ts`), holding pure functions:
  - `formatUsd(usd: number | null | undefined): string`
  - `formatUsdExact(usd)` for tooltips
  - `formatTokens(tokensIn, tokensOut)`, **moved** here from `RunTraceDrawer/helpers.ts`
    (output unchanged, e.g. `15k→1.2k`) so the banner can reuse it. The drawer imports it
    from the new location.
- `src/components/cost-text/CostText.tsx` (+ `index.ts`, `CostText.test.tsx`):
  `<CostText usd={…} />` renders a `mono tnum` span with `formatUsd`, the exact
  value in `title`, and a muted "—" when the value is null. This is the local
  equivalent of the design's `CostBadge`. We add it here because `@devdigest/ui`
  is vendored and must not be edited.

### 1. PR list: `PRRow` + page header

```
PULL REQUEST                    AUTHOR        SIZE      SCORE  STATUS          COST     UPDATED
⎇ Add rate limiting… #482       ◯ marisa.koch  M · 285   (61)   ● needs review  $0.0039      3h
⎇ Bump node 18 → 20 #460        ◯ deepak.r     S · 18     —     ● stale            —         9d
```

- `pulls/constants.ts`: `COLUMN_KEYS` gets `"cost"` between `"status"` and `"updated"`.
  `GRID` gets an extra `84px` track at the same position:
  `"1fr 132px 92px 60px 118px 84px 78px"`.
- `pulls/_components/PRRow/PRRow.tsx`: a new cell with `<CostText usd={pr.cost_usd} />`
  between the status badge and the updated cell.
- `messages/en/prReview.json`: `list.columns.cost = "Cost"`.
- The header row already renders from `COLUMN_KEYS`, so no change is needed there.

### 2. Timeline row: `RunHistory`

```
[reviewed] (64) Performance Reviewer openrouter/deepseek-v4-flash      8:52:14 PM
                ⚠1 💬1                                         12,991 tok · $0.0014   [≡] [🗑]
[error]         General Reviewer openai/gpt-4.1                        8:52:14 PM
                Schema validation failed after 3 attempts…      4,210 tok · $0.011    [≡] [🗑]
```

- `[number]/_components/RunHistory/RunHistory.tsx`: the right-hand meta column
  (it already shows `ran_at`) gets a second line: `{tokens} tok · <CostText usd={r.cost_usd} />`,
  in `mono tnum`, 11px, `--text-secondary`.
  - `tokens = tokens_in + tokens_out`, shown with the `{count, number}` locale format.
    The tooltip shows `in → out`.
  - When the line shows: always for `done`. For `failed`/`cancelled` only when
    `tokens > 0`, which is the usage spent before the error. Never while `running`.
  - If `cost_usd` is null, drop the `· $…` part and show only `12,991 tok`.
- `messages/en/prReview.json`: `timeline.tokens = "{count, number} tok"`.

### 3. Run drawer: `TraceBody` Stats

```
DURATION   TOKENS      COST    FINDINGS
8.2s       15k→1.2k    $0.06   3
```

- `RunTraceDrawer/_components/TraceBody/TraceBody.tsx`: add
  `<Stat label={t("trace.stat.cost")} val={formatUsd(stats.cost_usd)} />` between
  TOKENS and FINDINGS. `s.statsRow` is flex, so no layout change is needed. Failed and
  cancelled traces now show their real tokens and cost here too, with no extra code.
- `messages/en/runs.json`: `trace.stat.cost = "COST"`. This key was removed in `d45ab0d`.

### 4. Review accordion header: `ReviewRunAccordion`

```
⚙ Security Reviewer  request changes  3 findings · 2 blockers        [38]  $0.0013  6/13/2026, 8:52:51 PM  🗑  ⌄
```

- `[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`: add
  `<CostText usd={review.cost_usd} />` between the score badge and `formatWhen(...)`.
  Render it only when `review.cost_usd != null`. Old reviews and reviews without a run
  show nothing, so the header doesn't fill with dashes.
- Add `ReviewRunAccordion.test.tsx` (none exists yet): the cost renders when present and is absent when null.

### 5. Verdict banner: `VerdictBanner`

```
 ✕  Request changes  [3 findings · 2 blockers] [⚙ Security]      ( 38 )
    Summary text …                                              PR SCORE
                                                             ─────────────
                                                             $  $0.0013  9.1k→1.2k
```

- `[number]/_components/VerdictBanner/VerdictBanner.tsx`: new optional props
  `costUsd?: number | null`, `tokensIn?: number | null`, `tokensOut?: number | null`.
  - Under the PR SCORE label in `scoreCol`: a divider (`borderTop: 1px solid var(--border)`),
    then `Icon.DollarSign` (11px, muted), `<CostText usd={costUsd} />` and muted
    `formatTokens(tokensIn, tokensOut)`.
  - This row renders only when `tokensIn != null`, meaning the review is linked to a run.
    An unknown cost then shows "—" next to the tokens. `scoreCol` renders when
    `score != null || tokensIn != null`.
  - Styles go into `VerdictBanner/styles.ts` (`costRow`, `costIcon`, `costTokens`).
- `ReviewRunAccordion` passes `review.cost_usd`, `review.tokens_in`, `review.tokens_out`.
- `VerdictBanner.test.tsx`: add cases for cost + tokens shown, unknown cost showing "—",
  and no usage meaning no row.

### Contracts

Copy the fields from the server spec into `src/vendor/shared/contracts/{trace,platform,review-api}.ts`
and `src/vendor/shared/adapters.ts`. They must match the server copy exactly.

## Out of scope

- Sorting or filtering the PR list by cost.
- Summing costs on the client: the PR total comes from the server.
- Agent Performance and CI Runs screens.
- e2e flows: no existing flow asserts on these cells. Add one only if a flow for
  the PR list columns appears.

## Acceptance criteria

1. The PR list has a COST column between STATUS and UPDATED. A PR with priced runs
   shows the server total formatted by `formatUsd`. A PR with no runs, or only
   unknown costs, shows a muted "—".
2. Hovering any cost shows the exact value.
3. Each `done` timeline row shows `N tok · $X` under the time, or `N tok` when the cost is
   unknown. `failed`/`cancelled` rows show it only if they spent tokens. `running` rows never show it.
4. The drawer Stats show DURATION · TOKENS · COST · FINDINGS. A failed run shows its real
   usage. An old trace without `cost_usd` shows "—" and does not crash.
5. The review accordion header shows the run cost between the score and the time. It
   shows nothing when the cost is unknown.
6. The verdict banner shows `$ <cost> <in→out>` under PR SCORE for reviews linked to a run.
   It shows nothing for reviews without run usage.
7. After a run finishes, the timeline, accordion and banner show its cost without a
   reload. This works because `pr-runs` and `reviews` are already invalidated on
   completion. The PR list total updates on its next fetch (`staleTime` 30s, refetch on
   mount/focus, 60s interval).
8. All strings come from `messages/en/*.json`.
9. `pnpm typecheck` and `pnpm test` pass.

## Implementation plan (after the server half lands)

1. Sync contracts into `src/vendor/shared` and run `pnpm typecheck` to find every
   fixture that needs the new fields (`RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`,
   `VerdictBanner.test.tsx`, …).
2. `format-usage.ts` + tests. Cover every row of the formatting table, and move `formatTokens` there.
3. `CostText` + test: null renders "—", a value renders formatted text plus the exact value in `title`.
4. Drawer: COST stat + i18n key. `RunTraceDrawer.test.tsx` asserts `$0.06`, "—" for an old
   trace, and non-zero usage for a failed trace.
5. Timeline: second meta line + i18n key. `RunHistory.test.tsx` covers a done run with cost,
   a done run without cost, a failed run with tokens (line shown), a failed run with 0 tokens
   (no line) and a running run (no line).
6. Verdict banner: props, styles and the row, plus tests.
7. Review accordion: header cost, pass usage into the banner, new test file.
8. PR list: constants + `PRRow` cell + i18n key. Add `PRRow.test.tsx` covering a value and "—".
9. Manual check with `./scripts/dev.sh`: run one OpenRouter agent, one agent on an unpriced
   model, and one that fails (a bad model id or quota fails before any response, so
   expect `0 tok`/`$0.00` in the drawer and no timeline line). Then check all five surfaces.
   A failure *with* usage is hard to trigger by hand and is covered by the server
   integration tests.
10. `engineering-insights` wrap-up for `server/`, `reviewer-core/` and `client/`.

## Open questions

- None blocking.
