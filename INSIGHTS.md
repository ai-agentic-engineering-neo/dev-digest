# Insights — DevDigest

Non-obvious findings and gotchas that span more than one package. Add an
entry whenever something surprised you, so the next agent/session doesn't
relearn it. Package-local findings go in `<package>/INSIGHTS.md` instead.

## Codebase Patterns

- **2026-09-16** — `docs/README.md` and `specs/README.md` stub files use the
  header convention `# <thing> — <package>` (e.g. `# docs — DevDigest`,
  `# specs — client`) — follow it when adding new doc/spec stubs so headers
  stay consistent across packages. Evidence: `docs/README.md`,
  `client/specs/README.md`.
- **2026-09-17** — `*/src/vendor/shared/contracts/*.ts` (server + client
  copies) have no discoverable local source package or re-vendor tooling in
  this checkout, despite root `CLAUDE.md` describing them as "synced copies —
  edit the source package and re-vendor." In practice both copies must be
  hand-edited identically; verified via `diff` they were kept byte-identical
  (modulo comments) across a real feature. Evidence:
  `server/src/vendor/shared/contracts/{trace,platform}.ts` vs the `client/`
  copies.
- **2026-09-17** — This course repo's lab exercises are built by having the
  teacher develop the FULL feature, then squash-revert `main` back to a
  "starter" state before each lesson. When a feature/column looks entirely
  absent, run `git log --all --oneline -- <path>` before assuming it was
  never built — it may have existed and been deliberately stripped for the
  exercise (e.g. `agent_runs.cost_usd` existed at `0000_init`, was dropped by
  migration `0009`, added back by this session's L01 task 3).

## What Doesn't Work

- **2026-09-17** — Don't trust `git log --all` authorship as "the teacher's
  reference solution" without checking the actual committer. This repo's
  history includes commits from OTHER STUDENTS merged into shared
  integration branches (e.g. `93119a5`, authored by a different person than
  the course's own account) before the "revert: restore main to the starter
  state" commit stripped it all back out. A student's commit is exactly as
  fallible as any other implementation attempt — verify claims about "the
  right way to build X" against the actual lesson slides/checklist, not just
  whichever commit `git log` happens to surface first.
- **2026-09-17** — Adding a new skill under `.claude/skills/<name>/SKILL.md`
  does not get it discovered unless it's also added as a row in
  `.claude/skills/README.md`'s Catalog table — nothing enforces this
  automatically. Two locally-authored skills (`engineering-insights`,
  `esbuild-arch-mismatch`) were committed without a catalog row and stayed
  invisible until manually caught; vendored skills are also tracked in
  `skills-lock.json`, but locally-authored ones have no such backstop, so the
  catalog row is their only discoverability path. `.claude/skills/README.md`
  now documents the "catalog row in the same commit as SKILL.md" rule.
  Evidence: `.claude/skills/README.md`.
