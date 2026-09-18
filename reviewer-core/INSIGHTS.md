# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised
you, so the next agent/session doesn't relearn it.

## Recurring Errors & Fixes

- **2026-09-17** — `pnpm test`/`pnpm install` here can fail with
  `ERR_PNPM_IGNORED_BUILDS` (esbuild's postinstall script blocked by pnpm's
  build-approval gate). `client/` and `server/` already work around this via
  a local `pnpm-workspace.yaml` with an `allowBuilds: { esbuild: true, ... }`
  block (added in L01 sub-task 1; `client/pnpm-workspace.yaml:1-2`,
  `server/pnpm-workspace.yaml:1,3`); `reviewer-core/` has no such file yet.
  Until one is added, run `node_modules/.bin/vitest run` directly instead of
  `pnpm test` to bypass the install-time gate (works fine once deps are
  already present on disk). General playbook for this class of issue:
  `.claude/skills/esbuild-arch-mismatch/SKILL.md:1`.
- **2026-09-18** — Nothing told the model which language to write in, so
  DeepSeek (`deepseek/deepseek-v4-flash`) reviewed an English PR entirely in
  Chinese — valid UTF-8, not an encoding bug, just the model's default. The
  fix is a trusted `OUTPUT_LANGUAGE` system rule pinning summary / titles /
  rationale / suggestions to English (code and identifiers verbatim), kept
  SEPARATE from the do-not-touch `INJECTION_GUARD` and appended after it, so it
  applies to every path (studio server and CI) via `assemblePrompt`. Reviews
  already stored in another language stay as they are; only new runs change.
  Evidence: `reviewer-core/src/prompt.ts:35`, `reviewer-core/src/prompt.ts:97`.
