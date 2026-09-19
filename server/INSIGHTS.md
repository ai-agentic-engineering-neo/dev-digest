# Insights — `@devdigest/api`

Traps we have already hit in the server. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the entry format and for cross-package traps.

---

### `No file …_<name>.sql found` on a fresh database, while CI's migrated lane is green
**Date:** 2026-08-05
**Cause:** `src/db/migrations/meta/_journal.json` had history *rewritten* rather than
appended — an entry replaced instead of added, and one upstream migration dropped. A
database that is already migrated never replays those entries, so the failure only shows
up where the schema is built from zero. The regenerated snapshots had also silently lost
columns that `src/db/schema/runs.ts` still declares.
**Fix / rule:** the journal, the `.sql` files and `meta/*_snapshot.json` must always
agree — same count, tags in order, each snapshot's `prevId` pointing at the previous one.
Never hand-merge them: renumber your own migrations to sit *after* upstream's and keep
the snapshot chain relinked. Verify against a fresh testcontainer, not your dev DB.

### A dependency type-checks locally and fails CI with `TS2307`
**Date:** 2026-08-05
**Cause:** `fflate` was imported by a module but declared in neither `package.json` nor
the lockfile. It resolved locally only because a stray copy was sitting in
`node_modules` from an earlier install.
**Fix / rule:** after adding an import, confirm the package is declared —
`pnpm install --frozen-lockfile` reproduces what CI sees. A clean install is the only
honest check; a working local build proves nothing about the dependency graph.
