# Insights — DevDigest

Non-obvious findings and gotchas that span more than one package. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Package-local findings go in `<package>/INSIGHTS.md` instead.

## Tool & Library Notes

- **2026-09-18** — On this machine, the global `npm` at `/usr/local/bin/npm`
  is an ancient v5.3.0 that crashes on `npm install`/`npm run` with `node`
  managed via nvm at a much newer version (v26.9.0): `TypeError: cb.apply is
  not a function` inside `graceful-fs/polyfills.js`. Fix: use the
  nvm-bundled npm directly (`~/.nvm/versions/node/<version>/bin/npm`, v11+),
  or use `pnpm` for any package whose lockfile is `pnpm-lock.yaml`
  (`client/`, `server/`) — plain `npm install` in a pnpm-managed directory
  also fails separately (`Cannot read properties of null (reading
  'matches')`, unrelated project-config warnings about `node-linker` etc.).
  Not a project bug — an environment quirk to route around, every time. Bites the
  npm-managed `e2e/` package, run as `cd e2e && npm test` (`scripts/e2e.sh:18`).

## Codebase Patterns

- **2026-09-16** — `docs/README.md` and `specs/README.md` stub files use the
  header convention `# <thing> — <package>` (e.g. `# docs — DevDigest`,
  `# specs — client`) — follow it when adding new doc/spec stubs so headers
  stay consistent across packages. Evidence: `docs/README.md:1`,
  `client/specs/README.md:1`.
- **2026-09-17** — `*/src/vendor/shared/contracts/*.ts` (server + client
  copies) have no discoverable local source package or re-vendor tooling in
  this checkout, despite root `CLAUDE.md` describing them as "synced copies —
  edit the source package and re-vendor." In practice both copies must be
  hand-edited identically; verified via `diff` they were kept byte-identical
  (modulo comments) across a real feature. Evidence:
  `server/src/vendor/shared/contracts/trace.ts:1`,
  `server/src/vendor/shared/contracts/platform.ts:1` vs the identical
  `client/` copies (confirmed byte-identical again in this session's own
  `platform.ts` edits — see `client/INSIGHTS.md`/`server/INSIGHTS.md`).
- **2026-09-17** — This course repo's lab exercises are built by having the
  teacher develop the FULL feature, then squash-revert `main` back to a
  "starter" state before each lesson. When a feature/column looks entirely
  absent, run `git log --all --oneline -- <path>` before assuming it was
  never built — it may have existed and been deliberately stripped for the
  exercise (e.g. `agent_runs.cost_usd` existed at `0000_init`, was dropped by
  migration `0009`, added back by this session's L01 task 3). Evidence:
  `server/src/db/schema/runs.ts:23`.

## What Doesn't Work

- **2026-09-17** — Don't trust `git log --all` authorship as "the teacher's
  reference solution" without checking the actual committer. This repo's
  history includes commits from OTHER STUDENTS merged into shared
  integration branches (e.g. `93119a5`, authored by a different person than
  the course's own account) before the "revert: restore main to the starter
  state" commit stripped it all back out. A student's commit is exactly as
  fallible as any other implementation attempt — verify claims about "the
  right way to build X" against the actual lesson slides/checklist, not just
  whichever commit `git log` happens to surface first. Evidence: the
  repo's own starter/lesson contract at `README.md:78` (features
  intentionally stripped, one added back per lesson) and the strip commit
  `c6af1e4` ("revert: restore main to the starter state").
- **2026-09-17** — Adding a new skill under `.claude/skills/<name>/SKILL.md`
  does not get it discovered unless it's also added as a row in
  `.claude/skills/README.md`'s Catalog table — nothing enforces this
  automatically. Two locally-authored skills (`engineering-insights`,
  `esbuild-arch-mismatch`) were committed without a catalog row and stayed
  invisible until manually caught; vendored skills are also tracked in
  `skills-lock.json`, but locally-authored ones have no such backstop, so the
  catalog row is their only discoverability path. `.claude/skills/README.md`
  now documents the "catalog row in the same commit as SKILL.md" rule.
  Evidence: `.claude/skills/README.md:19-20` (the two catalog rows),
  `.claude/skills/README.md:47` (the rule itself).
- **2026-09-18** — Running `./scripts/e2e.sh` while `pnpm dev` is up used to
  break the DEV app with "Cannot reach the DevDigest engine at
  http://localhost:3101" (e.g. Agents → "Could not load agents"). Cause: both
  `next dev` servers shared `client/.next`, and `NEXT_PUBLIC_API_BASE` is
  INLINED into compiled chunks — the hermetic stack's chunks (API :3101) were
  then served by the dev server (API :3001), and :3101 vanished at teardown.
  The API and DB were healthy the whole time (`curl :3001/agents` → 200), so a
  backend check alone misleads; load the page in a real browser to see which
  base URL it calls. Fix: `distDir` is env-driven and the e2e stack uses
  `.next-e2e`. Evidence: `client/next.config.mjs:12`, `scripts/e2e.sh:46`.
- **2026-09-18** — A second Next build dir (`.next-e2e`, see the entry above)
  must be excluded everywhere `.next` is: ESLint otherwise lints the compiled
  output and fails on its `require()` calls (`client/eslint.config.mjs:10`).
  `next dev` also auto-adds `.next-e2e/types/**/*.ts` to `tsconfig.json`'s
  `include` — and REFORMATS the whole file while doing so; committing the
  include line up front (`client/tsconfig.json:33`) means Next finds nothing
  to add and leaves the file alone.
