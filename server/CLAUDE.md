# server/ — @devdigest/api

Fastify 5 + Drizzle/Postgres. Read [../CLAUDE.md](../CLAUDE.md) for the
repo-wide picture first.

## Read when

- API surface, request/DI flow, environment vars: read [README.md](README.md).
- repo-intel internals (indexer that powers the Indexed badge): read
  [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md).
- Deeper architecture notes/decisions beyond the README: read [docs/](docs/).
- Feature/requirement specs before building a module: read [specs/](specs/).
  - Run Cost Badge (persist + surface per-run `cost_usd`): read
    [specs/run-cost-badge.md](specs/run-cost-badge.md).
- Past gotchas and decisions from earlier sessions: read [INSIGHTS.md](INSIGHTS.md).

## Non-default conventions

- Each feature lives in `src/modules/<name>/` as `routes.ts` → `service.ts` →
  `repository.ts`; don't collapse the split.
- Adapters (LLM, GitHub, git, ast-grep, secrets, …) sit behind a DI container
  (`src/platform/container.ts`) so tests swap in `src/adapters/mocks.ts`.
- Routes declare Zod `params`/`body` schemas (`fastify-type-provider-zod`) —
  one schema drives both request validation and response serialization; don't
  hand-roll `Schema.parse(req.body)` in a handler.
- Secrets (API keys, `GITHUB_TOKEN`) are never part of `AppConfig` — they go
  through `SecretsProvider` (`~/.devdigest/secrets.json`, mode `0600`).

## Gotchas

- DB does **not** migrate on boot — run `pnpm db:migrate` manually after
  pulling schema changes.
- Every finding must cite a real diff line or `groundFindings` drops it; the
  score is recomputed from survivors, never trusted from the model.
- Repo Intel enrichment silently degrades to diff-only for an unindexed repo
  — it doesn't error.

## Do-not-touch

- `src/vendor/shared/**` — vendored copy of `@devdigest/shared`; edit the
  source and re-vendor, don't patch the copy in place.

## Commands

`pnpm dev` · `pnpm build` · `pnpm db:migrate` · `pnpm db:seed` ·
`pnpm db:generate` · `pnpm test` (see [README.md](README.md#testing) for the
unit/integration split) · `pnpm typecheck`
