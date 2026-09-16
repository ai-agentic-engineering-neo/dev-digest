---
name: esbuild-arch-mismatch
description: Diagnoses and works around esbuild native-binary CPU-architecture mismatches in this repo (e.g. a command failing with "You installed esbuild for another platform... @esbuild/darwin-arm64 present but this platform needs @esbuild/darwin-x64" or "ERR_PNPM_IGNORED_BUILDS"). Use ONLY when a command actually fails with one of these exact symptoms — never proactively, never as a general Node/pnpm troubleshooting guide, and never on a machine where commands are already succeeding. Explains why not to "fix" the global esbuild/node install and gives the safe, per-command workarounds already verified in this repo.
---

# esbuild architecture mismatch

This is a machine-specific packaging quirk, not a bug in DevDigest's code. It
shows up when esbuild's installed native binary doesn't match the CPU
architecture actually running Node (classically: installed under Rosetta on
Apple Silicon, or the reverse). **Do not try to fix the global esbuild/node
install** — that's out of scope for a coding task, risky (global toolchain
surgery), and unnecessary: every command below has a working, scoped
workaround that doesn't touch machine-wide state.

## Recognize it

Only act on this skill when you actually see one of these:

- `drizzle-kit generate` (or any esbuild-backed CLI) prints: *"You installed
  esbuild for another platform than the one you're currently using... the
  '@esbuild/darwin-arm64' package is present but this platform needs the
  '@esbuild/darwin-x64' package instead"* (or the arm64/x64 reverse).
- `pnpm install`/`pnpm test` fails with `ERR_PNPM_IGNORED_BUILDS` /
  *"Ignored build scripts: esbuild@..."*.

If none of these exact symptoms are present, this skill does not apply —
don't preemptively "fix" a working toolchain.

## What to do, per command

**`drizzle-kit generate` fails (need a new migration):** hand-author it to
exactly match drizzle-kit's own output convention — verified correct by a
real precedent in this repo's history (a hand-written
`0010_add_agent_run_cost.sql` matched a later commit's real
`drizzle-kit`-generated `0010_polite_sasquatch.sql` byte-for-byte for the
same schema change):
1. Write the `.sql` file (`server/src/db/migrations/NNNN_<name>.sql`) — a
   plain `ALTER TABLE`/`CREATE TABLE` statement, same one-liner style as the
   existing small migrations in that directory.
2. Copy the immediately-prior `meta/NNNN_snapshot.json`, patch only the
   changed table's `columns` (or other changed shape), set a fresh `id`
   (any UUID) and `prevId` = the prior snapshot's `id`.
3. Append one entry to `meta/_journal.json` (`idx`, `version` matching the
   existing entries, `when: Date.now()`, `tag` matching the new filename,
   `breakpoints: true`).
4. Validate by actually running the Docker-gated integration tests (they
   apply migrations against a real Postgres) — a passing run confirms the
   hand-written migration is structurally correct, not just plausible.

**`ERR_PNPM_IGNORED_BUILDS` on a fresh package install:** check whether that
package already has a local `pnpm-workspace.yaml` with an `allowBuilds`
block (this repo's `client/` and `server/` already do, from L01 sub-task 1).
If the package you're in doesn't have one yet, either add one matching that
convention, or work around it for now by invoking the already-installed
binary directly (e.g. `node_modules/.bin/vitest run` instead of `pnpm test`).

## Related INSIGHTS.md entries

The workarounds above were exercised for real in this repo — see the dated
entries (and don't duplicate them; add a new dated note only if you learn
something these don't already cover):
- `server/INSIGHTS.md` → "Recurring Errors & Fixes" (the `drizzle-kit
  generate` esbuild/Rosetta mismatch + hand-authored-migration workaround).
- `reviewer-core/INSIGHTS.md` → "Recurring Errors & Fixes" (the
  `ERR_PNPM_IGNORED_BUILDS` gap vs. `client`/`server`'s `allowBuilds` fix).
