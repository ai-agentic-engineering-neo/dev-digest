# Task 1.0 Proofs – Per-agent enable flag and link API

## Task Summary

`agent_skills` now has a per-agent `enabled` flag. `GET|POST /agents/:id/skills` return ordered links with skill summary fields; unchecking a skill keeps the row. Foreign-workspace `skill_id` is rejected with 422.

## What This Task Proves

- `AgentSkillLink` requires `enabled` and carries GET summary fields (`name`, `type`, `description`, `skill_enabled`).
- `POST { skills: [{ skill_id, enabled }] }` replaces links in order; a disabled middle row stays with `enabled: false`.
- Globally disabled skills remain listable; other-workspace ids are 422 and not linked.
- The `enabled` column is additive (`0015`); applied migrations were not edited.

## Evidence Summary

Hermetic contract + DTO tests, three Postgres integration cases, typecheck, lint, hermetic suite, and a new migration. Skills tab and prompt injection are still parent tasks 2.0 / 3.0.

## Artifact: Contract parse requires enabled

**What it proves:** `AgentSkillLink.parse` fails when `enabled` is omitted (other GET fields present) and succeeds with `enabled: true`.
**Why it matters:** The editor payload cannot silently drop the per-agent flag.
**Command:** `cd server && pnpm exec vitest run test/contracts.test.ts src/modules/agents/helpers.test.ts`

```
 ✓ src/modules/agents/helpers.test.ts (1 test) 2ms
 ✓ test/contracts.test.ts (9 tests) 7ms
 Test Files  2 passed (2)
      Tests  10 passed (10)
```

## Artifact: Integration link API

**What it proves:** Three links with the middle disabled keep stable `order` and summary fields; a globally disabled skill stays in GET with `skill_enabled: false`; a foreign `skill_id` returns 422 and is not linked.
**Why it matters:** Dual enablement and tenant isolation live in Postgres, not in mocked hooks.
**Command:** `cd server && pnpm exec vitest run test/agent-skills.it.test.ts`

```
 ✓ test/agent-skills.it.test.ts (3 tests) 6230ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Artifact: New migration only

**What it proves:** `agent_skills.enabled` is additive; history files `0000`–`0014` were not edited.
**Why it matters:** Applied migrations are immutable.
**Command:** `cd server && pnpm run db:generate`
**Artifact path:** `server/src/db/migrations/0015_handy_vision.sql`

```
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
```

## Artifact: Typecheck, lint, hermetic + integration suites

**What it proves:** The agents module type-checks, lints, and does not regress existing server tests.
**Command:** `cd server && pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`

```
$ tsc --noEmit -p tsconfig.json
$ eslint .
 Test Files  22 passed (22)
      Tests  156 passed (156)

 Test Files  9 passed (9)
      Tests  46 passed (46)
```

## Reviewer Conclusion

The link API now stores per-agent enablement without unlinking. Prompt injection and the Skills tab are not in this task.
