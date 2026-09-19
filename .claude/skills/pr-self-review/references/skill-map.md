# Skill map: changed file → review skills

Globs are relative to repo root. A file can match several rows; a skill with no matching files is not run.
`.claude/skills/<skill>/SKILL.md` must exist for every skill named here (checked by `scripts/gate.test.sh`).

| Glob | Skills |
|---|---|
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices` |
| `client/src/app/**`, `client/next.config.*` | `next-best-practices` |
| `client/**/*.test.{ts,tsx}` | `react-testing-library` |
| `server/src/**`, `reviewer-core/src/**` | `onion-architecture` |
| `server/src/**/routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/platform/**` | `fastify-best-practices` |
| `server/src/db/**`, `server/src/**/repository*` | `drizzle-orm-patterns` |
| `server/src/db/schema/**`, `server/src/db/migrations/*.sql` | `postgresql-table-design` |
| `*/src/vendor/shared/contracts/**` | `zod` |
| any `*.{ts,tsx,js,cjs,mjs}` that is not a test | `security` |

Deliberately unmapped: `mermaid-diagram`, `engineering-insights` (not review skills), `typescript-expert` (too generic, noisy).

## Skip list (never sent to LLM review; see `scripts/changed-files.sh`)

`*.snap`, lock files, `server/.dependency-cruiser-known-violations.json`, `server/src/db/migrations/meta/*`. Lock files and the journal are covered by `scripts/guards.sh`.

## Coverage

Changed files that match no row and are not skip-listed (e.g. `*.md`, `*.json`, workflows) are reported as "not reviewed by any skill". Add a row when that list shows something that deserves review.
