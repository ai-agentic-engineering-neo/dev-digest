# client/docs

Deeper documentation for `client` that we deliberately keep out of
`CLAUDE.md` (to avoid bloating context every session). `CLAUDE.md` links here
— Claude reads files from this folder only when the task actually needs them.

What belongs here: detailed feature architecture, decisions with rationale
(ADR-like notes), integration nuances that don't fit the "gotcha" format.

What doesn't belong here: anything already obvious from the code, and
anything that changes weekly.

## Contents

- [data-flow.md](./data-flow.md) — the single path from the API to a component
  (`api.ts` → TanStack Query hooks → render), why components never `fetch`, and
  the `src/vendor/*` drift hazard.
