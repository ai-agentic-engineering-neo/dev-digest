# File → Skill Routing Table

No such mapping existed anywhere in this repo before this skill (checked:
`.claude/skills/README.md`, the `agents` DB schema, the reviewer-core
contracts) — this table is the routing source of truth. Match every file
in `git diff --name-only main...HEAD` against every row below (a file can
match multiple rows); a file matched by no row falls to the last row.

| Changed files match | Skills to run | Notes |
|---|---|---|
| `client/**/*.tsx`, `client/**/*.jsx` | `frontend-architecture`, `react-best-practices` | UI code — placement + anti-patterns |
| `client/src/app/**` (route/page/layout/loading/error files) | + `next-best-practices` | App Router–specific conventions |
| `client/**/*.test.tsx`, `client/**/*.spec.tsx` | + `react-testing-library` | test-file conventions |
| `server/src/modules/**/*.ts` (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`) | `onion-architecture` | layering: routes→service→repository |
| `server/src/modules/**/routes.ts` | + `fastify-best-practices` | route/plugin mechanics |
| `server/src/db/schema/**`, any file under a `migrations/` directory | `postgresql-table-design`, `drizzle-orm-patterns` | schema + query/migration patterns |
| Any changed file whose diff hunk adds/touches a line importing from `'zod'` (grep, not path-based: `git diff main...HEAD -- <file> \| grep -q "from 'zod'"`) | `zod` | schema mechanics |
| Any file under `server/src/modules/**` (always, when any backend file changed) | `security` | security issues aren't confined to one folder — always run when `server/**` is in the diff |
| Any `.ts`/`.tsx` file in the diff | `typescript-expert` | lightweight pass: type-safety only — the skills above already own the domain-specific checks, this only catches type-level issues (e.g. `any`, unsound casts, missing narrowing) |
| Anything not matched above (e.g. `reviewer-core/**`, `scripts/**`, `docs/**`, root config) | built-in `code-review` skill, medium effort, scoped to just these files | no dedicated project skill exists for these areas |

## Why this shape

- **`onion-architecture` and `fastify-best-practices` overlap on
  `routes.ts` on purpose** — one owns layering (may this file touch the
  DB directly?), the other owns Fastify mechanics (schema validation,
  plugin registration). They rarely flag the same line.
- **`security` always runs on any backend change**, unlike the other rows
  which are file-shape-specific, because injection/auth/secret-handling
  issues can appear in a service, a repository, or a route just as easily.
- **`typescript-expert` is intentionally narrow** ("type-safety only") to
  avoid re-litigating architecture/business-logic points the other
  skills already cover for the same file — without that scoping note,
  two skills would produce near-duplicate findings on every TS file.
- **The `code-review` fallback** exists because `reviewer-core/` and
  `scripts/` have no dedicated project skill — reusing the built-in
  general-purpose skill avoids inventing review logic for areas this
  table doesn't otherwise cover, and keeps the "review everything in the
  diff" guarantee intact.
