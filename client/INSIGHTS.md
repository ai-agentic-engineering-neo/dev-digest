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
