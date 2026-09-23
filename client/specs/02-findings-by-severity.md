# Findings by Severity

**Status:** agreed

The feature spans the API and the UI, so its single spec lives in
[`server/specs/02-findings-by-severity.md`](../../server/specs/02-findings-by-severity.md).

UI summary: one shared `src/components/severity-counts/`. It renders chips like
`ⓘ2 ⚠1 💡2` (non-zero severities only); hovering them opens a popover,
`ⓘ N FINDINGS`, that lists every finding of that review. The chips appear in two
places:

- the Agent runs Timeline, in a `done` run's row, in place of "N finding(s)";
- a new `FINDINGS` column in the PR list, for the latest review, whose findings
  load on the first hover.

Display only: no clicks, no filters. The run sidebar and Review runs are unchanged.

Amended 2026-09-23: the popover header reads `N FINDINGS IN THIS RUN`, and
Review-run finding cards say Accept / Reject — see the Amendment in the server spec.

Amended 2026-09-23 (2): an expanded Review run now shows `N CRITICAL · N WARNING ·
N SUGGESTION` pills under the verdict and Critical / Warning / Suggestion filter
buttons (`FindingsPanel`) — see the Amendment in the server spec.
