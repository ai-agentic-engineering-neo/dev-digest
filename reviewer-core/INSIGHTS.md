# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Recurring Errors & Fixes

- **2026-09-17** — `pnpm test`/`pnpm install` here can fail with
  `ERR_PNPM_IGNORED_BUILDS` (esbuild's postinstall script blocked by pnpm's
  build-approval gate). `client/` and `server/` already work around this via
  a local `pnpm-workspace.yaml` with an `allowBuilds: { esbuild: true, ... }`
  block (added in L01 sub-task 1); `reviewer-core/` has no such file yet.
  Until one is added, run `node_modules/.bin/vitest run` directly instead of
  `pnpm test` to bypass the install-time gate (works fine once deps are
  already present on disk). General playbook for this class of issue:
  `.claude/skills/esbuild-arch-mismatch/SKILL.md`.
