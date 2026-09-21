# DevDigest — insights (root)

Durable findings that cross package boundaries. Anything scoped to one
package belongs in that package's own file instead —
[client](client/INSIGHTS.md) · [server](server/INSIGHTS.md) ·
[reviewer-core](reviewer-core/INSIGHTS.md) · [e2e](e2e/INSIGHTS.md).

Append-only: correct a stale entry with a dated note beneath it rather than
editing it away. Sections are fixed — add to the one that fits, never invent
a new heading. Written and read by the `engineering-insights` skill.

## Decisions

### 2026-09-18 — Invoke best-practices skills proactively during implementation, not only `engineering-insights`

**What:** Before/while writing code that matches a listed skill's trigger
(Fastify routes → `fastify-best-practices`, Drizzle schema/queries →
`drizzle-orm-patterns`, Zod schemas → `zod`, React components →
`react-best-practices`, etc.), invoke that skill — don't skip it just
because `engineering-insights` was already run for the session.
**Why:** User correction — the Run Cost Badge session touched Fastify
routes, a Drizzle migration, new Zod contract fields, and React components,
and none of the matching skills were invoked; the work proceeded by
copying nearby code patterns instead.
**Rejected:** Treating "I can already see the pattern in adjacent code" as
a substitute for consulting the dedicated skill — adjacent code shows what
was done before, not whether it was a best practice worth repeating.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-18** — `server/src/vendor/shared` and `client/src/vendor/shared`
  are meant to be the same contracts package but there is no sync script
  between them — confirmed firsthand adding `cost_usd` to `contracts/
  trace.ts` and `contracts/platform.ts`: both copies had to be hand-edited
  identically, and nothing catches it if you forget one. Diff both copies
  before trusting either: `diff server/src/vendor/shared/contracts/
  trace.ts client/src/vendor/shared/contracts/trace.ts`.

## Tool & Library Notes

- **2026-09-18** — On this machine `pnpm` is not on `PATH`, and `corepack
  pnpm` fails with `EACCES` opening `~/.cache/node/corepack` (permission/
  sandbox issue) — use `npx --yes pnpm@10 <cmd>` instead; it installs and
  runs reliably in every package. Also: Postgres needs Docker Desktop
  running first, or `docker compose up -d` just hangs/fails — `open -a
  Docker`, then poll `docker info` until it succeeds, before compose.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
