# Worked example

A synthetic diff and the routing decision + report it produces, to make
the workflow in `SKILL.md` concrete.

## Sample diff

```
server/src/modules/reviews/routes.ts          (modified — inline container.db call added)
server/src/db/migrations/0007_add_index.sql   (modified — already listed in meta/_journal.json)
client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx  (modified)
client/src/vendor/shared/contracts/reviews.ts (modified)
server/src/vendor/shared/contracts/reviews.ts (unchanged — the client copy moved alone)
```

## Step 2 — routing (routing.md)

| File | Matched skill(s) |
|---|---|
| `server/src/modules/reviews/routes.ts` | `onion-architecture`, `fastify-best-practices` |
| `server/src/db/migrations/0007_add_index.sql` | *(no skill row — handled by enforced.md §1 instead)* |
| `client/.../FindingsTab.tsx` | `frontend-ui-architecture`, `react-best-practices` |
| `client/src/vendor/shared/contracts/reviews.ts` | `zod` |

Skills skipped (zero matching files): `drizzle-orm-patterns`,
`postgresql-table-design`, `react-testing-library`, `next-best-practices`,
`typescript-expert`, `security`.

## Step 3 — hard rules (enforced.md)

- §1: `0007_add_index.sql` matches an already-applied journal entry →
  `CRITICAL`.
- §3: `client/src/vendor/shared/contracts/reviews.ts` changed but
  `server/src/vendor/shared/contracts/reviews.ts` did not → `CRITICAL`.
- §7: no test file touched anywhere in this diff → `MEDIUM`.

## Step 4/5 — domain forks + verify pass

The `onion-architecture` fork reports `routes.ts:42` calling
`container.db` directly with no `repository.ts` in the module — `CRITICAL`
per that skill's own severity vocabulary. The verify fork confirms
(`repository.ts` genuinely doesn't exist for this module) → survives,
stays `CRITICAL`.

The `frontend-ui-architecture` fork reports a prop-drilling smell in
`FindingsTab.tsx` — `HIGH`. No verify pass needed (non-blocking either
way).

## Step 6 — report

```
## PR Self-Review — BLOCKED (3 critical)

### server/src/db/migrations/0007_add_index.sql [CRITICAL] hard-rule §1
Edits an already-applied migration (present in meta/_journal.json)
instead of adding a new one.

### client/src/vendor/shared/contracts/reviews.ts [CRITICAL] hard-rule §3
Vendor copy changed without its server/src/vendor/shared mirror — the two
must stay identical.

### server/src/modules/reviews/routes.ts:42 [CRITICAL] onion-architecture
Route handler calls container.db directly; no repository.ts exists for
this module. → onion-architecture SKILL.md §2 (verified)

### client/.../FindingsTab.tsx:118 [HIGH] frontend-ui-architecture
...

### (diff-wide) [MEDIUM] hard-rule §7
No test file touched in this diff.

---
Skills run: onion-architecture, fastify-best-practices,
frontend-ui-architecture, react-best-practices, zod, hard-rules
Skills skipped (no matching files): drizzle-orm-patterns,
postgresql-table-design, react-testing-library, next-best-practices,
typescript-expert, security
```

Verdict is `BLOCKED` — the skill does not run `gh pr create`. The user
fixes the migration (adds a new one instead of editing 0007), mirrors the
vendor contract change into `server/src/vendor/shared`, and re-runs;
`onion-architecture`'s finding and the `FindingsTab.tsx` finding are the
only ones re-forked (their files didn't change) — pulled from cache per
"Incremental re-review" in `SKILL.md`.
