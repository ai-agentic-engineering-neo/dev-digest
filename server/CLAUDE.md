# server — CLAUDE.md

## Stack

Fastify 5, Drizzle ORM, `postgres` + pgvector, Zod-схеми з `src/vendor/shared` як
route-схеми (`fastify-type-provider-zod`). Деталі — [README](./README.md).

## Commands

`pnpm dev` (`:3001`) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm typecheck`
Unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'` · Integration (Docker): `pnpm exec vitest run .it.test`

## Map

- `src/modules/<name>/routes.ts` — кожен фіча-модуль сам реєструє свої роути
- `src/platform/container.ts` — DI-контейнер, адаптери підмінюються моками в тестах
- `src/adapters/{llm,github,git,astgrep,secrets}` — порти назовні
- `src/modules/repo-intel` — індексатор коду (живе всередині server, не окремий пакет)
- `src/db/schema/*` — схема БД, уже містить таблиці для всіх 8 уроків курсу
- `src/vendor/shared` — вендорені Zod-контракти (`@devdigest/shared`)

## Non-default conventions

- Валідація — schema-first через zod `params`/`body` у route, а не
  `Schema.parse(req.body)` вручну в хендлері.
- Секрети НЕ в `AppConfig`: йдуть через `SecretsProvider` →
  `~/.devdigest/secrets.json` (`0600`), `process.env` лише fallback.

## Gotchas

- Міграції НЕ застосовуються на boot — `pnpm db:migrate` вручну, інакше
  `relation ... does not exist`.
- `reviewer-core` імпортується як сирий TS через tsconfig path alias — без
  `npm ci` у `reviewer-core` сервер падає з `ERR_MODULE_NOT_FOUND` при старті.
- `EMBEDDINGS_ENABLED=false` за замовчуванням → нуль запитів до OpenAI, доки не
  увімкнено явно.
- `REPO_INTEL_ENABLED=true` за замовчуванням, але repo map у промпті порожній,
  доки репо не проіндексовано — тиха деградація до diff-only.
- Grounding gate (`groundFindings`) — механічна перевірка цитувань; фінальний
  score НЕ береться від LLM.

## Do-not-touch

- `INJECTION_GUARD` (з `reviewer-core`, вендорений сюди) — не спрощувати на
  keyword-фільтр, це свідоме архітектурне рішення.
- `src/db/schema/*` — таблиці майбутніх уроків не видаляти, навіть якщо здаються
  "unused".

## Докладніше

[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md)
