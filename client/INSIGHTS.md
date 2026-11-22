# client — insights

What is true about this module that the code does not show: how it behaves, why
it is built this way, and what to watch for. Curated and kept current by
people; edit or remove an entry when it stops being true.

Raw lessons from individual work sessions go to [`LEARNINGS.md`](LEARNINGS.md)
(append-only, written by the `engineering-insights` skill). When a learning
proves to be a lasting fact about the module, promote it here.

Format: `## YYYY-MM-DD — short title`, then **What happened**, **Why**, and
**Rule**.

## 2026-11-21 — The client's contract copy differs from the server's

**What happened:** `src/vendor/shared` differs from
`../server/src/vendor/shared` in five files (see `../server/INSIGHTS.md`).

**Why:** the contracts are vendored per package with no sync check, and client
tests mock `fetch`, so a mismatch does not fail any client test.

**Rule:** before building on a contract here, diff it against the server copy;
treat the server copy as the one the API actually validates against.

## 2026-11-22 — A findings counter must equal what a click on it shows

**What happened:** the severity filter on a review run (`SeverityFilter` inside
`FindingsPanel`) shows a counter per level next to `Hide low confidence`. The
counters are computed after the confidence filter and before the severity
filter, and both filters live in the panel's local state, so nothing is
requested when a counter is clicked.

**Why:** the list a reviewer sees is the result of both filters. A counter taken
from the unfiltered run stops matching the list as soon as the toggle is on, and
an empty level that is also the active filter would leave no way to clear it.

**Rule:** derive every count and every list in `FindingsPanel` from the findings
already loaded, through the helpers in `FindingsPanel/helpers.ts`; count before
the filter the counter itself applies and after every other filter; never
disable the control that clears the active filter.
