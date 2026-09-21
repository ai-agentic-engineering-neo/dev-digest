# Run Cost Badge — client

Render the per-run cost that [server/specs/run-cost-badge.md](../../server/specs/run-cost-badge.md)
adds to `PrMeta.cost_usd`, `RunSummary.cost_usd`, and `RunTrace.stats.cost_usd`
in three places. Depends on that server spec shipping first (new fields must
exist on the wire) — this doc only adds rendering, no new data fetching (the
existing `usePulls`, `usePrRuns`, `useRunTrace` hooks already fetch these
objects).

## Shared formatting — `client/src/lib/format.ts` (new file)

No formatter for money exists yet (`formatSeconds`/`formatTokens` currently
live private to `RunTraceDrawer/helpers.ts`, but this value is needed by three
unrelated component trees: the pulls list, the pull detail timeline, and the
trace drawer — none of which should reach into another's colocated
`_components/` folder). Add a small shared util, mirroring the existing
`formatSeconds`/`formatTokens` style:

```ts
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}
```

- `null`/`undefined` (no data — unpriced model, failed run, or a PR never
  reviewed) → `"—"`, **never `"$0.00"`** (explicit product requirement — a
  missing price must not read as a free run).
- A genuine `0` (a free-tier model) → `"$0.00"`, distinct from missing data.
- Sub-cent runs keep 4 decimals so they don't all collapse to `$0.00`/`$0.01`;
  everything else uses 3 decimals. (Reasonable default — cheap to retune if
  it reads wrong once real numbers are on screen.)

`RunTraceDrawer/helpers.ts` re-exports it (`export { formatCost } from
"@/lib/format";`) so `TraceBody.tsx`'s existing `import { formatSeconds,
formatTokens } from "../../helpers"` only grows by one name instead of
gaining a second import source.

## Screen 1 — PR list COST column

Files: `pulls/constants.ts`, `pulls/_components/PRRow/PRRow.tsx`,
`pulls/styles.ts`, `messages/en/prReview.json`.

- `constants.ts`: add `"cost"` to `COLUMN_KEYS` (line ~42-49), positioned
  between `"status"` and `"updated"`. Extend `GRID` (line 27,
  `"1fr 132px 92px 60px 118px 78px"`) with one more fixed track for it, e.g.
  `"1fr 132px 92px 60px 118px 72px 78px"`.
- `messages/en/prReview.json`: add `"cost": "Cost"` to `list.columns` (line
  ~89-96), alongside `score`/`status`.
- `styles.ts`: add a `costCell` style mirroring `updatedCell` (line ~42-48:
  `fontSize: 12, color: "var(--text-muted)", textAlign: "right"`) — cost is a
  number so it should also carry the `mono`/tabular-figures treatment the
  score/size cells use elsewhere.
- `PRRow.tsx`: add one `<div style={s.costCell}>` cell between the status
  badge (line ~56-60) and the updated-time cell (line 61), rendering
  `<span className="mono">{formatCost(pr.cost_usd)}</span>`. No extra
  `reviewed ? … : "—"` branching needed — `pr.cost_usd` is already `null`
  until the PR has a review (server spec §4), and `formatCost(null)` already
  renders `"—"`.

## Screen 2 — Agent runs timeline (per-run cost)

File: `pulls/[number]/_components/RunHistory/RunHistory.tsx`.

Add the cost as a second line in the existing top-right metadata column
(line ~198-200, currently only the timestamp):

```tsx
<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
  {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
  {settled && <span className="mono">{formatCost(r.cost_usd)}</span>}
</div>
```

Gate it on `settled` (`r.status === "done"`, the same flag already used for
the findings/blockers line at ~191-196), **not** on `formatCost` alone — the
product requirement is "every **completed** run shows a badge"; running/
failed/cancelled rows show no cost element at all rather than a bare `"—"`,
consistent with how those rows already omit the findings/blockers line.

## Screen 3 — Trace sidebar Cost stat tile

File: `pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`.

Add a fourth `<Stat>` to the existing three-tile stats row (line ~62-66):

```tsx
<div style={s.statsRow}>
  <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
  <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
  <Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />
  <Stat label={t("trace.stat.findings")} val={stats.findings} />
</div>
```

(Cost placed between tokens and findings — cost derives from tokens, so
keeping them adjacent reads naturally; findings stays last as the outcome
metric.) Unlike screen 2, this tile is **always** shown (trace only exists for
completed/failed/cancelled runs that reached `saveRunTrace`, never for
in-flight ones) — `formatCost` already renders `"—"` when `stats.cost_usd` is
`null`, so no extra gating is needed here.

`messages/en/runs.json`: add `"cost": "COST"` to `trace.stat` (line ~39-43),
matching the existing all-caps `DURATION`/`TOKENS`/`FINDINGS` style.

## Non-goals

- No cost row on the PR Detail verdict banner — out of scope for this
  iteration (see server spec's Non-goals).
- No change to `RunHistory`'s layout for non-settled (running/failed/
  cancelled) rows beyond what already exists.
- No new hooks, no new endpoints — `usePulls`, `usePrRuns`, `useRunTrace`
  already fetch the objects this feature extends.

## Acceptance criteria

- PR list shows a right-aligned `Cost` column; `"—"` for never-reviewed PRs.
- Every **completed** run row in the Agent runs timeline shows its cost under
  the timestamp; running/failed/cancelled rows show neither.
- The trace sidebar's Stats section always shows 4 tiles (Duration, Tokens,
  Cost, Findings); Cost reads `"—"` when the run's cost is unknown, never
  `"$0.00"`.
- `formatCost` is defined once (`client/src/lib/format.ts`) and reused by all
  three screens — no per-screen duplicate formatter.
