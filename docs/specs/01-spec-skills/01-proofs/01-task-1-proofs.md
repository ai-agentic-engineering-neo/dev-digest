# Task 1.0 Proofs – Skills CRUD module

## Task Summary

Workspace-scoped Fastify module over the existing `skills` / `skill_versions` tables: create, read, update, delete. Body/type/name/description changes bump `version` and snapshot; toggling `enabled` does not. Optional `note` on snapshots via a new migration.

## What This Task Proves

- `POST /skills` persists a manual skill and writes `skill_versions` v1.
- Updates that change config bump version and store `note` when provided; `enabled`-only updates do not.
- Empty description/body are rejected at the HTTP boundary (422).
- Unknown and cross-workspace ids return 404; delete cascades versions.

## Evidence Summary

Hermetic bump-rule tests, six Postgres integration cases, typecheck, lint, and a new additive migration (`note` only). No existing migration files were edited.

## Artifact: Hermetic bump-rule tests

**What it proves:** `isConfigChange` is true for name/description/type/body and false for a no-op / empty patch (enabled-only is excluded from the helper by design).
**Why it matters:** The versioning rule must not depend on Docker.
**Command:** `cd server && pnpm exec vitest run src/modules/skills/helpers.test.ts`

```
 ✓ src/modules/skills/helpers.test.ts (2 tests) 2ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Artifact: Integration CRUD tests

**What it proves:** Create + list + get; 404 unknown/foreign workspace; 422 empty description/body; body/type bump with note; enabled toggle does not snapshot; delete then 404 (versions gone).
**Why it matters:** This is the seam where Fastify, Zod, and Postgres actually meet.
**Command:** `cd server && pnpm exec vitest run test/skills.it.test.ts`

```
 ✓ test/skills.it.test.ts (6 tests) 5365ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## Artifact: New migration only

**What it proves:** `skill_versions.note` is additive; history files `0000`–`0013` were not edited.
**Why it matters:** Applied migrations are immutable.
**Command:** `cd server && pnpm run db:generate`
**Artifact path:** `server/src/db/migrations/0014_ambitious_screwball.sql`

```
ALTER TABLE "skill_versions" ADD COLUMN "note" text;
```

## Artifact: Typecheck, lint, hermetic suite

**What it proves:** The new module type-checks, lints, and does not regress the hermetic server suite.
**Command:** `cd server && pnpm run typecheck && pnpm run lint && pnpm exec vitest run --exclude '**/*.it.test.ts'`

```
$ tsc --noEmit -p tsconfig.json
$ eslint .
 Test Files  21 passed (21)
      Tests  154 passed (154)
```

## Reviewer Conclusion

The skills library API is the source of truth: CRUD, workspace isolation, and version snapshots behave as spec 01 unit 1 requires. UI, restore, and prompt wiring are still later parent tasks.
