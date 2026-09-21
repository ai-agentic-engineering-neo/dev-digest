# File → Skill Routing

This is the bucket table [SKILL.md](SKILL.md) Step 2 uses to fan out. It only governs the
**additional, file-specific** skills — `security` and `code-review` already run on
everything per Step 1 and are not listed again here.

## Always excluded (never bucketed, never counted, never reviewed)

Per [AGENTS.md](../../../AGENTS.md)'s "Do not touch" list — these are generated or
immutable, flagging them as a "finding" would be noise the user can't act on anyway:

- `server/src/db/migrations/**` (incl. `meta/`)
- `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`
- `reviewer-core/package-lock.json`, `e2e/package-lock.json`

## UI files

| Skill | Patterns | Notes |
|---|---|---|
| `frontend-ui-architecture` | `client/src/**` | Where a component/hook/util belongs, colocation, feature-folder structure. |
| `react-best-practices` | `client/**/*.tsx`, `client/**/*.jsx` | Component/hook correctness, anti-patterns. |
| `next-best-practices` | `client/src/app/**`, `client/next.config.*` | App Router, RSC boundaries, async APIs. |
| `react-testing-library` | `client/**/*.test.tsx`, `client/**/*.test.ts` under `client/` | Test-file changes only. |

## Backend files

| Skill | Patterns | Notes |
|---|---|---|
| `onion-architecture` | `server/src/modules/**`, `reviewer-core/src/**` | Dependency direction, layer placement. |
| `fastify-best-practices` | `server/src/**/routes.ts`, `server/src/app.ts`, `server/src/platform/**` | Routes, plugins, hooks, validation. |
| `drizzle-orm-patterns` | `server/src/db/**` (excluding `migrations/**`, see above) | Schema/query authoring. |
| `postgresql-table-design` | `server/src/db/schema/**` | Schema-design review specifically. |

## Cross-cutting (bucketed by pattern, on top of the always-on Step 1 passes)

| Skill | Patterns | Notes |
|---|---|---|
| `zod` | `server/src/vendor/shared/**`, `**/*.schema.ts` | Contract/schema changes — also check for breaking changes to shapes other packages import. |
| `typescript-expert` | none by default | Only dispatch if a subagent/reviewer already flags non-trivial generic/type-level changes during Step 1 — don't run this on every PR. |

## Not part of review routing

`engineering-insights`, `mermaid-diagram` — meta/authoring skills, not review skills.
Never bucketed.

## Unmatched files

If a changed file is under `client/` or `server/` but matches no pattern above, note it in
the report as "no specific skill matched — covered only by the Step 1 general passes"
rather than silently dropping it. Do not invent a skill assignment that isn't in this table.
