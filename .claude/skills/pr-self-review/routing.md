# Routing table

Path patterns and content signals → which of this repo's other skills own
that file. Kept separate from `SKILL.md` so it can be updated as new
skills or packages show up without touching the workflow prose. A file can
match more than one row; every matched skill gets its own review pass.

## Path-based rows

| Path pattern | Matched skill(s) | Notes |
|---|---|---|
| `client/src/app/**/_components/**`, `client/src/components/**` | `frontend-ui-architecture`, `react-best-practices` | placement/anatomy + behavioral React rules |
| `client/src/app/**/page.tsx`, `**/layout.tsx`, `**/route.ts` | + `next-best-practices` | on top of the row above, RSC boundary / route-handler specifics |
| `client/**/*.test.tsx` | `react-testing-library` | in addition to whichever row above also matched the same folder |
| `client/src/vendor/ui/**` | *(skip — vendored)* | flows into the hard rule below instead (do-not-touch / vendor mirroring) |
| `server/src/modules/<name>/**` | `onion-architecture`, `fastify-best-practices` | for `onion-architecture`, run its own `enforced.md` checklist, not just its `SKILL.md` prose |
| `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` | |
| `server/src/db/migrations/**` (new files only) | `drizzle-orm-patterns` | an already-applied migration file being edited is a hard-rule violation, not a skill review — see `enforced.md` §1 |
| `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | `zod` | plus the vendor-mirroring hard rule (`enforced.md` §3) |
| `reviewer-core/**` | `typescript-expert` | no framework-specific skill exists for this package; also route to `zod` if the change touches its own contract/type definitions |
| `e2e/**` | `typescript-expert` | thin coverage by design — say so explicitly in the report rather than silently running nothing extra |
| `*.md`, `.claude/**`, config-only files with no `.ts`/`.tsx` content | *(skip)* | no domain skill owns prose/config |

## Signal-based rows (grep the *added* lines of the diff, not the path)

These are matched by content, not directory, so they can fire on any
package and don't blindly run on every file that happens to be TypeScript.

| Signal (grep pattern over added lines) | Matched skill(s) |
|---|---|
| `req\.body`, `req\.query`, `req\.params`, raw SQL / template-literal query construction, file-upload handling, `LocalSecretsProvider`, JWT/session/cookie code, `process\.env\.` reads | `security` |
| introduces generics, conditional/mapped types, `as any`, `@ts-expect-error`, or non-trivial type-level code | `typescript-expert` (in addition to whatever path-based row matched) |

Keeping `typescript-expert` signal-gated (rather than matching every
`.ts`/`.tsx` file) is deliberate — it stops the report being dominated by
a low-value pass on files that are structurally fine but happen to be
TypeScript.

## Precedence notes

- Rows are additive, not exclusive: a `server/src/modules/reviews/`
  change that also edits `server/src/db/schema/reviews.ts` in the same
  commit matches both the module row and the schema row, and gets a pass
  from all four matched skills (`onion-architecture`,
  `fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`).
- The do-not-touch / vendor-mirroring / migration-immutability / secrets /
  test-coverage checks in `enforced.md` run **regardless** of which rows
  above matched — they are not part of this table.
