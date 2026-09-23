# server — CLAUDE.md

## Stack

Fastify 5, Drizzle ORM, `postgres` + pgvector, Zod schemas from
`src/vendor/shared` doubling as route schemas (`fastify-type-provider-zod`).
Details — [README](./README.md).

## Commands

`pnpm dev` (`:3001`) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm typecheck`
Unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'` · Integration (Docker): `pnpm exec vitest run .it.test`
No lint step exists in this package — the check gate is `pnpm typecheck` + the unit run.

## Map

- `src/modules/<name>/routes.ts` — each feature module registers its own routes
- `src/platform/container.ts` — DI container; adapters get swapped for mocks in tests
- `src/adapters/{llm,github,git,astgrep,secrets}` — outbound ports
- `src/modules/repo-intel` — the code indexer (lives inside server, not a separate package)
- `src/db/schema/*` — DB schema, already holds tables for all 8 course lessons
- `src/vendor/shared` — vendored Zod contracts (`@devdigest/shared`)

## Non-default conventions

- Validation is schema-first via zod `params`/`body` on the route, not
  `Schema.parse(req.body)` by hand in the handler.
- Secrets are NOT part of `AppConfig`: they go through `SecretsProvider` →
  `~/.devdigest/secrets.json` (`0600`), `process.env` is only a fallback.

## Gotchas

- Migrations are NOT applied on boot — run `pnpm db:migrate` manually,
  otherwise you'll hit `relation ... does not exist`.
- `reviewer-core` is imported as raw TS via a tsconfig path alias — without
  `npm ci` in `reviewer-core`, the server crashes at startup with
  `ERR_MODULE_NOT_FOUND`.
- `EMBEDDINGS_ENABLED=false` by default → zero OpenAI requests until it's
  explicitly turned on.
- `REPO_INTEL_ENABLED=true` by default, but the repo map in the prompt stays
  empty until the repo is indexed — a silent degrade to diff-only.
- The grounding gate (`groundFindings`) is a mechanical citation check; the
  final score is NOT taken from the LLM.

## Naming conventions

Repo-wide rules — [../CLAUDE.md](../CLAUDE.md#naming-conventions). Server-specific:

- Tables are `snake_case` plural (`agent_runs`, `pull_requests`, `findings`);
  the Drizzle object exporting one is `camelCase` (`t.agentRuns`).
- Columns are `snake_case` in SQL, `camelCase` in the Drizzle schema
  (`costUsd: doublePrecision('cost_usd')`) — the wire DTO keeps the SQL spelling.
- One folder per feature module, role-named files: `routes.ts` (HTTP only),
  `service.ts` (orchestration), `repository/<entity>.repo.ts` (SQL),
  `helpers.ts` / `status.ts` (pure, unit-testable).
- Tests live in `test/`, named after the unit (`pulls-status.test.ts`);
  anything needing Docker gets the `.it.test.ts` suffix.

## Do-not-touch

- `INJECTION_GUARD` (from `reviewer-core`, vendored in here) — don't simplify
  it into a keyword filter, that's a deliberate architectural decision.
- `src/db/schema/*` — don't delete tables for future lessons even if they
  look "unused".
- **`src/db/migrations/**` — applied migrations are immutable.** Never edit,
  renumber or delete an existing `.sql` or `meta/_journal.json`. A schema
  change is ALWAYS a new migration via `pnpm db:generate`; editing an applied
  one desyncs every DB that already ran it, with no error to warn you.
- **`pnpm-lock.yaml` — never hand-edit, never delete to "fix" an install.**
  It changes only as the by-product of a pnpm command (this package is pnpm,
  not npm).

## Read when

- Need the API route contracts, env vars, full description → read [README.md](./README.md).
- Planning a new module or route → start with [specs/](./specs/), then write code.
- Need details on the DI container or a specific adapter → [docs/](./docs/).
- Need the architecture of the whole pipeline (not just server) → read [../docs/architecture.md](../docs/architecture.md).
- Before changing something non-trivial — check whether we've already hit this wall → [INSIGHTS.md](./INSIGHTS.md).
