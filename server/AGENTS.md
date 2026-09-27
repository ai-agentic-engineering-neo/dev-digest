# server — `@devdigest/api`

Imports repos and pull requests, indexes them with `repo-intel`, stores agents, runs
the reviewer. Fastify 5 + Drizzle ORM over Postgres (pgvector); adapters (LLM, GitHub,
git, ast-grep, tokenizer, secrets) sit behind a DI container and are mocked in tests.

## Commands

`pnpm dev` (:3001) · `pnpm typecheck` · `pnpm db:migrate` · `pnpm db:seed` (idempotent)

Tests: unit `pnpm exec vitest run --exclude '**/*.it.test.ts'` (no Docker) ·
integration `pnpm exec vitest run .it.test` (needs Docker) · both `pnpm test`

## Map

- `src/modules/<name>/` — feature plugin (routes + service), registered in `index.ts`
- `src/adapters/` — ports to the outside world; `src/adapters/mocks.ts` for tests
- `src/platform/` — config, DI container, errors, SSE, jobs, model routing
- `src/db/schema` + `src/db/migrations` — Drizzle schema and generated SQL
- `src/vendor/shared` — Zod contracts (`@devdigest/shared`)
- `test/` — `*.it.test.ts` is DB-backed, everything else is hermetic

## Read when

- Adding or editing a route or module → `README.md` § "Request & DI flow" and § "API map".
- Touching prompts or grounding → `README.md` § "Review context (non-obvious)".
- Working on indexing, symbols or the repo map → `src/modules/repo-intel/README.md`.
- Writing a test → `../TESTING.md` § "Conventions".
- Adding config or an env var → `README.md` § "Environment".
- Working from a spec → `specs/<feature>.md`, before the first edit.
- Something behaves inexplicably → `INSIGHTS.md` (§ What Doesn't Work, § Recurring Errors).
- You learned something non-obvious → append it to the matching `INSIGHTS.md` section.
- Adding a derived column to the PR list → `docs/pr-list-read-model.md` (one
  IN-query per column; "latest" vs "total" is deliberate).
- Touching skills, the prompt's skills block, or the import path →
  `docs/skills-in-prompt.md` (two SQL gates; imported text is NOT wrapped as
  untrusted data, and why).
- Deeper background on a subsystem → `docs/`.

## Conventions

- **Validation is schema-first.** Each route declares Zod `params` / `body` schemas
  via `fastify-type-provider-zod`; invalid input is rejected with 422 before the
  handler runs. Do not hand-roll `Schema.parse(req.body)`.
- **Plugins register before modules** — helmet, cors, rate-limit, SSE and the error
  handler must already be on the instance for encapsulated module plugins to inherit.
- A new module is one import plus one `app.register` in `src/modules/index.ts`.
- **A DB-backed test must use the `*.it.test.ts` suffix** (any test importing
  `test/helpers/pg.ts`), otherwise it lands in the hermetic lane and fails there.
- Secrets never touch the DB or git: `SecretsProvider` (`~/.devdigest/secrets.json`, 0600).
- `src/vendor/shared` is the copy `reviewer-core` type-checks against; the client
  keeps its own. Change a contract in both.

## Naming

- A module is `src/modules/<name>/` with kebab-case files inside
  (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`).
- Drizzle: table objects are camelCase plural (`pullRequests`), columns are
  camelCase in TS and snake_case in SQL; the wire shape stays snake_case.
- Zod contract schemas are PascalCase and export a type of the same name.
- Tests: hermetic `<area>.test.ts`, DB-backed `<area>.it.test.ts` — the suffix is
  what routes a test into its CI lane.

## Do not touch

- `pnpm-lock.yaml` — never hand-edited; add a dependency with `pnpm add` and commit
  the lockfile it writes.
- `clones/**` — runtime data, git-ignored.
- Applied files in `src/db/migrations/` — a change means a **new** migration
  (`pnpm db:generate`), never an edit in place.

## Gotchas

- Migrations do not run on boot: a fresh DB fails at route level, not at startup.
- `NODE_ENV=test` silences logs and disables the global rate limit — expected, not a bug.
- Integration tests self-skip when Docker is absent, so a green run does not prove
  they executed.
