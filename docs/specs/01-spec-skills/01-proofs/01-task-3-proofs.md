# Task 3.0 Proofs – Versions tab (history, Diff, Restore)

## Task Summary

Append-only skill body snapshots with newest-first list, line-level Diff vs current, and Restore that copies an old body forward as a new version. Current row has no Restore.

## What This Task Proves

- `GET /skills/:id/versions` is newest-first; unknown version is 404.
- Two body saves produce ≥2 version rows; restore v1 sets live body to v1 text, inserts a higher version, and leaves v1 in place.
- Versions tab lists Current without Restore; confirming Restore calls the restore endpoint; Diff shows a text difference.

## Evidence Summary

Eight Postgres integration cases (six CRUD + two version/restore) and client RTL tests for the tab + `diffBodies`. Browser: Diff of v1 vs current, then restore (API) so Config shows the v1 body as v3.

## Artifact: Integration versions + restore

**What it proves:** Newest-first list, get-one 200/404, restore copies body forward without deleting history, foreign workspace restore is 404.
**Why it matters:** Restore is the seam the Agents module does not have; it must not rewrite old rows.
**Command:** `cd server && pnpm exec vitest run test/skills.it.test.ts`

```
 ✓ test/skills.it.test.ts (8 tests)
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Artifact: Client Versions tab + diff helper

**What it proves:** Newest-first labels, Current has no Restore, confirm → `restore.mutate({ id, version: 1 })`, Diff contains `-` / `+` lines.
**Command:** `cd client && pnpm test`

```
 Test Files  21 passed (21)
      Tests  84 passed (84)
```

Focused: `VersionsTab.test.tsx` (4), `helpers.test.ts` (`diffBodies`).

## Artifact: Typecheck, lint, hermetic server

**Command:** `cd server && pnpm run typecheck && pnpm run lint && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Command:** `cd client && pnpm run typecheck && pnpm run lint`

```
server: tsc --noEmit / eslint . / 21 files, 154 tests passed
client: tsc --noEmit / eslint .
```

## Artifact: Browser — Diff and restored body

**URL:** `http://localhost:3000/skills/<id>?tab=versions`

v2 Current (no Restore); v1 has Diff + Restore. Diff of v1 vs current showed `- Cover empty and overflow inputs.` / `+ Also cover timezone edges.` After `POST .../versions/1/restore`, Config body was `# Corner cases\nCover empty and overflow inputs.` at `version` 3; v1 row remained.

## Reviewer Conclusion

Spec 01 unit 3 is closed: history is append-only, Diff is readable without a new dependency, Restore copies forward. Spec 01 parent tasks 1.0–3.0 are complete. Next: `/SDD-4-validate-spec-implementation`. Specs 02 (agent bind) and 03 (import / Test Quality) are not in this task list.
