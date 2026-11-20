# server — Fastify API :3001, слухає лише 127.0.0.1. НЕ містить логіки рев'ю (вона в ../reviewer-core).

## Stack
Fastify 5 · Drizzle 0.45 + Postgres 16/pgvector · Zod 3.25 · fastify-type-provider-zod 4 · fastify-sse-v2 · p-queue · vitest 2 · pnpm

## Commands
- `pnpm typecheck` · `pnpm test` (unit + integration)
- unit без Docker: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration (Docker): `pnpm exec vitest run .it.test`
- Міграції не автоматичні: `pnpm db:generate` → `pnpm db:migrate`; `pnpm db:seed` ідемпотентний

## Map
- src/modules/<feature>/ — routes → service → repository; реєстр статичний: modules/index.ts
- src/platform/container.ts — DI composition root; local-only.ts — Host/Origin guard
- src/adapters/ — github, git, llm, astgrep, depgraph, tokenizer, secrets (моки: adapters/mocks.ts)
- src/db/schema/ — таблиці ВСІХ milestone'ів наперед, більшість порожні — так задумано
- src/vendor/shared/ — Zod-контракти (правило синхронізації — у кореневому CLAUDE.md)

## Conventions
- Адаптери й спільні репозиторії — лише через `container.*`, без `new` у модулі
- Модуль не імпортує з теки іншого модуля
- Новий модуль → реєструй у modules/index.ts (@fastify/autoload у deps, але не використовується)
- Тест, що імпортує test/helpers/pg.ts, мусить мати суфікс `*.it.test.ts`
- Тести герметичні: MockLLMProvider / MockGitClient з adapters/mocks.ts, без мережі й ключів

## Gotchas
- package.json у `skip-worktree` (локальний варіант відрізняється) — не покладайся на скрипти test:unit/test:integration
- Рев'ю — `void executeRuns()` у процесі; clone/index — через JobRunner (p-queue + таблиця jobs). Це різні механізми
- RunBus живе в пам'яті: рестарт сервера = втрачений live-лог, «осиротілі» run'и прибирає reaper на старті
- Нема індексу repo-intel → рев'ю йде по самому diff, без помилки
- server/clones/** — runtime-дані, git-ignored

## Do not touch
- platform/local-only.ts, bind на 127.0.0.1, helmet / rate-limit — захист від DNS rebinding
- platform/grounding.ts, platform/prompt.ts — shim'и над reviewer-core; логіку міняй там, не тут

## Read when
- Before adding or changing a route → read README.md ("API map", "Request & DI flow")
- Before changing what goes into the review prompt → read README.md ("Review context")
- Before changing env/config → read README.md ("Environment")
- Before changing repo-intel → read src/modules/repo-intel/README.md
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before editing anything here → read INSIGHTS.md

## Insights
Знайшов неочевидну пастку → допиши в INSIGHTS.md: `- YYYY-MM-DD · <область> · <що сталося> → <як правильно>`.
Пункт спрацював двічі → перенеси в Gotchas. (L06: перейде у хук / slash-команду.)
