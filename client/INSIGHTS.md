# client insights

Non-obvious lessons learned while working here — what was tried, what didn't
work, and why. One entry per insight (date + short title + a few lines),
newest last. Skip routine changes; only record what would otherwise get
re-discovered the hard way.

## Gotchas & recurring errors

### 2026-09-17 · The PR list table card clips any absolutely positioned popover inside a row
- **Context:** hover popovers or tooltips inside `/repos/:repoId/pulls` rows
- **Insight:** `s.tableCard` sets `overflow: "hidden"` to keep the rounded corners. A `position: absolute` popover in a row gets cut off at the card edge, worst on the bottom rows.
- **Do:** ALWAYS position the popover with `position: fixed`, computed from the trigger's `getBoundingClientRect()` and flipped above in the lower half of the viewport. Reuse `FindingsBadges` / `positionFor` rather than writing a new one.
- **Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts:90`, `client/src/components/findings-summary/FindingsBadges.tsx:20`, `client/src/components/findings-summary/styles.ts:19`
