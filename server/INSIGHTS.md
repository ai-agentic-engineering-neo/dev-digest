# Insights — server

Running log of non-obvious things learned while working in `@devdigest/api`:
gotchas, dead ends, decisions that don't belong in the fixed map in
[`CLAUDE.md`](CLAUDE.md). Newest entries at top.

<!-- Add entries below, e.g.:
## 2026-09-15 — short title
What happened, what was tried, what actually worked or didn't, and why.
-->

## 2026-09-16 — fixed: `pnpm db:migrate`/`pnpm db:seed` silently no-op when the checkout path has spaces [Mistake]
Both `src/db/migrate.ts` and `src/db/seed.ts` guarded their CLI entrypoint
with `import.meta.url === \`file://${process.argv[1]}\``.
`import.meta.url` is percent-encoded (spaces → `%20`); `process.argv[1]` is
not. On a checkout path containing spaces (e.g. this repo under
`.../AI Agentic Engineer/dev-digest/...`), the two never match, so the CLI
branch was skipped in BOTH files — `pnpm db:migrate` / `pnpm db:seed` exited
0 with **zero output and nothing applied/seeded**, no error at all. This is
exactly the trap that produces "No system user found — run `pnpm db:seed`"
even right after having run it (confirmed live: a user hit this after
`./scripts/dev.sh --no-seed` + a separate `pnpm db:seed`). Fixed in both
files by comparing `fileURLToPath(import.meta.url)` to `process.argv[1]`
instead of raw string equality — verified `pnpm db:migrate` and
`pnpm db:seed` now print their success line and actually apply/seed.
Anyone hitting a "ran the command, nothing happened, no error" mystery on a
spacey path should check this pattern in any other `if (import.meta.url ===
...)` CLI entrypoint in this codebase.

## 2026-09-16 — a run's completion writes TWO independent sibling documents [Context]
`run-executor.ts` persists the same in-memory numbers (`durationMs`,
`tokensIn`, `tokensOut`, now `costUsd`) twice, in two unrelated calls:
`completeAgentRun()` (→ the `agent_runs` row, source for `RunSummary`/PR-list
cost) and the `RunTrace.stats` object literal a few lines later (→ the
`run_traces` jsonb blob, source for the trace-drawer stat row). Neither read
path derives from the other. Adding any new per-run stat means touching
both call sites in `run-executor.ts` AND both `RunStats`/`RunSummary` shapes
in `vendor/shared/contracts/trace.ts` (server AND client copies) — missing
one silently leaves the stat blank on exactly one of the three UI surfaces
(PR list / timeline vs. the run trace drawer) while the others work fine.

## 2026-09-16 — pnpm 12's build-approval gate blocks headless `pnpm install`/`db:generate` [Decision]
This env's pnpm is v12 (via `corepack`/`npx pnpm`), which added a
mandatory interactive `pnpm approve-builds` gate for any dependency with a
native build script (`esbuild`, `ssh2`, `cpu-features`, `protobufjs`, …).
Non-interactively it always fails with `ERR_PNPM_IGNORED_BUILDS`, even with
`--ignore-scripts` — there's no documented non-interactive bypass flag.
Worked around by skipping `pnpm run <script>` for one-off CLI needs and
invoking the already-installed binary directly instead (e.g.
`node_modules/.bin/drizzle-kit generate`, `node_modules/.bin/vitest run`,
`node_modules/.bin/tsc --noEmit`) — the packages were already resolved into
`node_modules` from an earlier successful install, so the binaries exist
even though the "approve builds" step never completed. Also: running
`pnpm install` in `reviewer-core/` (which is npm-managed, tracked
`package-lock.json`) auto-creates a stray `pnpm-lock.yaml` — remove it and
reinstall with `npm install` instead.
