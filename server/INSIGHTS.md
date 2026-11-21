# server — insights

What is true about this module that the code does not show: how it behaves, why
it is built this way, and what to watch for. Curated and kept current by
people; edit or remove an entry when it stops being true.

Raw lessons from individual work sessions go to [`LEARNINGS.md`](LEARNINGS.md)
(append-only, written by the `engineering-insights` skill). When a learning
proves to be a lasting fact about the module, promote it here.

Format: `## YYYY-MM-DD — short title`, then **What happened**, **Why**, and
**Rule**.

## 2026-11-21 — The two `@devdigest/shared` copies have already drifted

**What happened:** `server/src/vendor/shared` and `client/src/vendor/shared`
differ in five files (`adapters.ts`, and `contracts/eval-ci.ts`,
`knowledge.ts`, `productionize.ts`, `trace.ts`).

**Why:** the contracts are vendored per package, and nothing checks that the
copies match.

**Rule:** when changing a contract, apply the change to both copies in the same
commit, and diff the two folders before relying on a contract that the client
also uses.
