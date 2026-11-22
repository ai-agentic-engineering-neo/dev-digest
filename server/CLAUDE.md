# server — Fastify API + Postgres (`@devdigest/api`, :3001)

Імпорт репозиторіїв і PR, індексація (`repo-intel`), агенти, запуск рев'ю. Корінь проєкту: [../CLAUDE.md](../CLAUDE.md).

## Стек
Fastify 5 (helmet, cors, rate-limit, `fastify-sse-v2`) · Drizzle ORM · `postgres` · Zod + `fastify-type-provider-zod` · pino · vitest + testcontainers. pnpm.

## Команди
- `pnpm dev` — API на :3001 (tsx watch) · `pnpm build` / `pnpm typecheck`
- `pnpm db:generate` — нова міграція зі змін `src/db/schema/` · `pnpm db:migrate` · `pnpm db:seed` (ідемпотентний)
- `pnpm test`; лише hermetic: `pnpm exec vitest run --exclude '**/*.it.test.ts'`; лише з БД: `pnpm exec vitest run .it.test` (потрібен Docker)

## Карта (`src/`)
- `modules/<name>/` — фіча = Fastify-плагін (`routes.ts`, `service.ts`, `repository.ts`); реєструється статично в `modules/index.ts`.
  Є: `repos` `pulls` `polling` `reviews` `agents` `settings` `workspace` `repo-intel`.
- `platform/` — DI-контейнер (`container.ts`), config, errors, SSE, run-logger, model-router.
- `adapters/` — порти назовні: llm, github, git, astgrep, tokenizer, secrets, embedder, depgraph. Моки — `adapters/mocks.ts`.
- `db/` — `schema/*.ts`, `migrations/`, `seed.ts`. · `vendor/shared` — Zod-контракти.
- Серце рев'ю: `modules/reviews/run-executor.ts` → `reviewer-core`.

## Конвенції (не дефолтні)
- Схема-first: Zod-схема роуту одночасно валідує запит і серіалізує відповідь; невалідне → 422 до хендлера. Не писати `Schema.parse(req.body)` руками.
- Сервіси беруть залежності з DI-контейнера, не імпортують адаптери напряму — інакше не підмінити в тестах.
- Нова фіча = новий `modules/<name>/` + рядок у `modules/index.ts`.
- `*.it.test.ts` — з реальним Postgres; решта — hermetic.

## Gotchas
- Міграції не запускаються при старті. Без `pnpm db:migrate` будуть `relation … does not exist`.
- Windows: `db:migrate`/`db:seed` мовчки нічого не роблять → [../INSIGHTS.md](../INSIGHTS.md).
- Ключі — через `SecretsProvider` (`~/.devdigest/secrets.json`), не в `AppConfig` і не в БД.
- `platform/{grounding,prompt,structured}.ts` — тонкі реекспорти з `reviewer-core`; логіку не додавати сюди.
- Repo Intel увімкнений за замовчуванням, але без індексації репо тихо деградує до ripgrep.

## Do-not-touch
- `src/db/migrations/**` — лише `pnpm db:generate`; не редагувати й не видаляти навіть застосовані файли.
- `src/vendor/shared/**` — дублюється в `client`; узгоджувати з обома копіями.

## Далі читати
- **Перед роботою** (одразу після запиту користувача) прочитай [INSIGHTS.md](INSIGHTS.md) цього модуля. **Наприкінці** запиши лише суттєве й нове і прокоментуй (`Update YYYY-MM-DD:`) записи, на які спирався, через skill `engineering-insights` (спершу перечитай файл: дубль не пиши; нема суттєвого — нічого не пиши).
[README.md](README.md) (діаграми, API map, env) · [docs/](docs/README.md) · [specs/](specs/README.md) · [INSIGHTS.md](INSIGHTS.md) · `src/modules/repo-intel/README.md`
