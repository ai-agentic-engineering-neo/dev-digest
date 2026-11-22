# Examples: good vs bad entries

All taken from this repo's real sessions.

## Good - Recurring Errors & Fixes (root INSIGHTS.md, cross-cutting)
```
- **db:migrate / db:seed silently do nothing on Windows** · 2026-11-22 · confirmed
  dev.sh reports success but the DB has no tables and the API returns 500 (`Failed query … from "users"`).
  Cause: the CLI guard `import.meta.url === \`file://${process.argv[1]}\`` in server/src/db/{migrate,seed}.ts never matches
  on Windows (`file:///D:/…` vs `file://D:\…`). Fix: compare via `pathToFileURL(process.argv[1]).href`.
  Workaround: call `runMigrations`/`seed` from a throwaway tsx script. Evidence: server/src/db/migrate.ts.
```
Why good: exact symptom, root cause, fix, workaround, evidence; one finding.

## Good - Tool & Library Notes
```
- **pnpm 12 fails install with ERR_PNPM_IGNORED_BUILDS** · 2026-11-22 · confirmed
  pnpm 12 treats ignored build scripts (esbuild, protobufjs, ssh2) as an error; pnpm 10 only warns. Use `npm i -g pnpm@10`.
```

## Good - What Doesn't Work
```
- **Calling `pnpm db:migrate` on Windows to apply migrations** · 2026-11-22 · confirmed
  Exits 0 without running (see Recurring Errors & Fixes). Don't trust its exit code; check `\dt` in the container instead.
```
Why good: records a dead end and a way to detect it - the most valuable kind of entry.

## Good - Open Questions
```
- **Should client/server vendor/shared be unified?** · 2026-11-22 · open
  The copies already differ in adapters.ts and contracts/{eval-ci,knowledge,productionize,trace}.ts. Decide: shared package
  vs. a sync script. Next step: diff contract-by-contract and see which side is newer.
```

## Bad - noise (do NOT write)
- "Use async/await carefully." - generic, no evidence.
- "The server uses Fastify." - already in CLAUDE.md/README.
- "Fixed a typo in client/README.md." - trivial.
- "API key is sk-…" or "my path is C:\Users\<name>\…" - secrets / personal data.
- A second entry about the Windows migration bug - extend the existing one instead (new evidence, new date).

## Routing examples
- Windows migration bug found while working in `server/` but affects `dev.sh` too → root (cross-cutting), pointer in `server/INSIGHTS.md`.
- A `next-intl` message key quirk found in `client/src/app/**` → `client/INSIGHTS.md`.
- A grounding-gate edge case found in `reviewer-core/src/grounding.ts` → `reviewer-core/INSIGHTS.md`.
