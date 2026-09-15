# server (@devdigest/api)

## Before answering

Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` first.

## Conventions (not obvious from code)

- Adapters (llm, github, git, astgrep, secrets, tokenizer, …) sit behind the
  DI container (`platform/container.ts`) — services depend on interfaces,
  never concrete classes; tests swap in `adapters/mocks.ts`.
- Route validation is schema-first: Zod schemas from `src/vendor/shared`
  double as both request validation and response serialization
  (`fastify-type-provider-zod`) — don't hand-roll `Schema.parse(req.body)`.
- Secrets never come from `AppConfig` — they go through `SecretsProvider`
  (`~/.devdigest/secrets.json`, `process.env` fallback).

## Use when

- Stack, request/DI flow, API map, env vars → read `README.md`
- Indexing pipeline / repo map / blast radius → `src/modules/repo-intel/README.md`
- Deep-dives / specs / running notes → `docs/` · `specs/` · `INSIGHTS.md`
- Cross-package rules (vendoring, migrations, ESM imports) → `../CLAUDE.md`
