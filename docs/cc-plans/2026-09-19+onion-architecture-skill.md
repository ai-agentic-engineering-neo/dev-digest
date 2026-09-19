# Plan: скіл `onion-architecture` для backend (server + reviewer-core)

## Context

Backend уже частково шарований (`routes.ts → service.ts → repository.ts`, порти в `vendor/shared/adapters.ts`, реалізації в `src/adapters/`, composition root `platform/container.ts`), але правило не записане і не перевіряється. Через це є дрейф: drizzle/`db/schema` імпортують `pulls/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts`, `reviews/service.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`, `settings/feature-models.ts`; `repos/service.ts` лізе в `repo-intel/constants.ts`.
Мета: скіл, що каже агенту **куди йде код і в який бік дозволені залежності** для наших інструментів (Fastify, Drizzle, Zod, SDK-адаптери), і dependency-cruiser, що це **перевіряє**. Наявні порушення фіксуємо як baseline (не рефакторимо в цій задачі).

Рішення користувача: scope = server + reviewer-core; enforcement = скіл + dependency-cruiser (baseline для старих порушень); форма = мапінг на поточні файли, без нових папок; процес = TDD для скілів (RED → GREEN → REFACTOR), як у `frontend-ui-architecture`.

## Кільця ↔ файли (ядро скіла)

| Кільце | Файли | Може імпортувати |
|---|---|---|
| **Domain** (центр) | `modules/<m>/model.ts`, чисті `helpers.ts`, `constants.ts`; `vendor/shared/contracts/*` (Zod + `z.infer`), `vendor/shared/adapters.ts` (порти); `platform/errors.ts`; **весь `reviewer-core/src`** | лише domain + `zod` |
| **Application** | `service.ts`, `run-executor.ts`, job handlers | domain, порти, власний `repository.ts` (клас + `import type` рядків), `Container` як тип |
| **Infrastructure** | `repository.ts` / `repository/*`, `src/adapters/**`, `src/db/**` | domain; drizzle, SDK |
| **Presentation** | `routes.ts`, `_shared/context.ts`, `_shared/schemas.ts` | application, contracts, errors; **не** drizzle/db |
| **Composition root** | `platform/container.ts`, `app.ts`, `server.ts`, `modules/index.ts` | усе (єдине місце, що знає конкретні класи) |

Прагматичні рішення (ponytail): без interface для репозиторію з однією реалізацією — сервіс залежить від класу свого `repository.ts`, але не від drizzle; порти потрібні тільки для зовнішнього світу (LLM, GitHub, git, secrets…), вони вже є.

## Правила по інструментах (зміст `tools.md`)

- **Fastify** — модуль = плагін у `routes.ts`; route тільки: parse (Zod type provider) → `getContext` → виклик service → статус. Бізнес-логіки в хуках/декораторах нема. DI — через `app.container` (decorator), не імпорт конкретних класів. `AppError` → error handler, не `reply.status` з бізнес-гілок.
- **Drizzle** — `drizzle-orm`, `db/schema`, `db/client` тільки в repository/`db`. Кожен запит scoped `workspaceId`. Repo повертає рядки; маппінг row → DTO — чиста функція в `helpers.ts` (`toRepoDto` як еталон). Транзакції: межу тримає service; repo-методи приймають опційний `tx` (патерн Sentry «atomic repositories»). Reduce-on-read агрегати — функції в `pulls/*` з row-типами, без SQL у route.
- **Zod** — parse на межі: вхід HTTP (routes), відповіді зовнішніх API/LLM (adapters, `structured.ts`), env (`config.ts`). Всередині — тільки `z.infer`-типи, без повторного parse. Wire-типи ніколи не пишемо руками.
- **SDK-адаптери** (`openai`, `@anthropic-ai/sdk`, `octokit`, `simple-git`, `@vscode/ripgrep`, `@ast-grep/napi`, `js-tiktoken`, `dependency-cruiser`) — тільки в `src/adapters/**` (і `reviewer-core/src/llm/`), за портом; помилки SDK → `ExternalServiceError`. Новий зовнішній сервіс = порт у `vendor/shared/adapters.ts` (обидві копії!) + адаптер + mock у `adapters/mocks.ts` + getter у Container з `overrides`.
- **Межі між модулями** (sliced onion) — модуль A бачить модуль B тільки через його `index.ts` або через Container (`agentsRepo`, `reviewRepo`, `repoIntel`), ніколи через внутрішні файли.
- **reviewer-core** — чисте ядро: жодного `fastify`, `drizzle-orm`, `postgres`, імпорту з `server/`; LLM лише через `LLMProvider`-порт; публічна поверхня — `src/index.ts`.
- **Тести по кільцях** — domain: чисті unit; application: `ContainerOverrides` + `adapters/mocks.ts`; infrastructure: `*.it.test.ts` (testcontainers).

## Файли

Створити:
- `.claude/skills/onion-architecture/SKILL.md` — overview, таблиця кілець, «Step 1 classify → Step 2 place → Step 3 check deps», red flags, як запускати `pnpm arch`. Формат/frontmatter як у `frontend-ui-architecture/SKILL.md`.
- `.claude/skills/onion-architecture/tools.md` — правила по інструментах (розділ вище) з коротким good/bad кодом із нашого репо.
- `.claude/skills/onion-architecture/README.md` — motivation, scope-split із сусідніми скілами (`fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `postgresql-table-design`), TDD-лог (RED-прогалини, GREEN-результат, REFACTOR-правки), **Sources** (нижче).
- `server/.dependency-cruiser.cjs` — forbidden-правила:
  1. `no-db-outside-infra`: `src/modules/**` (крім `repository*`) ↛ `drizzle-orm`, `src/db/(schema|client)`
  2. `routes-thin`: `routes.ts` ↛ `drizzle-orm`, `src/db/**`, `src/adapters/**`
  3. `domain-pure`: `model.ts|helpers.ts|constants.ts`, `vendor/shared/**` ↛ `fastify`, `drizzle-orm`, `src/adapters/**`, `platform/container`
  4. `sdk-only-in-adapters`: SDK-пакети (список вище) тільки з `src/adapters/**`
  5. `no-cross-module-internals`: `modules/A/**` ↛ `modules/B/**` крім `modules/B/index.ts` (і `_shared`)
  6. `core-no-app`: нічого не імпортує `app.ts`/`server.ts` крім `server.ts`/тестів
  7. `reviewer-core-pure`: `../reviewer-core/src/**` ↛ `fastify`, `drizzle-orm`, `postgres`, `server/**`
  8. `no-circular`
- `server/.dependency-cruiser-known-violations.json` — baseline (`depcruise --output-type baseline`), згенерований, не руками.

Змінити:
- `server/package.json` — скрипт `"arch": "depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --ignore-known"` (dependency-cruiser уже в deps, lockfile не чіпаємо).
- `.claude/skills/README.md` — рядок у Catalog.
- `server/CLAUDE.md`, `reviewer-core/CLAUDE.md` — «Read when: додаєш модуль/файл → `onion-architecture`», згадка `pnpm arch` у командах.

## Sources (для README; усі перевірені в цій сесії)

Onion / Clean / Hexagonal:
- Jeffrey Palermo — The Onion Architecture, part 1 / part 2: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ · https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- Herberto Graça — Onion Architecture (Software Architecture Chronicles): https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- Oliver Drotbohm — Sliced Onion Architecture: http://odrotbohm.github.io/2023/07/sliced-onion-architecture/
- Hexagonal architecture (Wikipedia): https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)
- Khalil Stemmler — Clean Node.js Architecture: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- André Bazaglia — Clean architecture with TypeScript: DDD, Onion: https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- Mark Seemann — DI / Composition Root (InfoQ): https://www.infoq.com/articles/DI-Mark-Seemann/

Інструменти:
- Fastify — Plugins / Decorators / Plugins Guide: https://fastify.dev/docs/latest/Reference/Plugins/ · https://fastify.dev/docs/latest/Reference/Decorators/ · https://fastify.dev/docs/latest/Guides/Plugins-Guide/
- Fastify clean template (dep-cruiser boundaries через Fastify idioms): https://github.com/Luxlorys/fastify-clean-template
- Sentry — Atomic Repositories in Clean Architecture and TypeScript (Drizzle + tx): https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/
- Microsoft — Designing the infrastructure persistence layer: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
- Alexis King — Parse, don't validate: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- dependency-cruiser для архітектури: https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c · https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/ · https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/

(Під час імплементації: ще раз WebFetch кожен URL перед записом у README; мертві — викинути. Docs Drizzle transactions і dependency-cruiser rules reference підтягнути через context7.)

## Кроки (TDD для скіла, `superpowers:writing-skills`)

**Делегування:** усе, що не потребує мого контексту рішень, роблять сабагенти з `model: "sonnet"`, паралельно де незалежно:
- RED і GREEN сценарії (по агенту на сценарій, 3 паралельно);
- перевірка URL-ів із Sources (WebFetch) + підтягування docs Drizzle transactions / dependency-cruiser rules через context7;
- чернетка `.dependency-cruiser.cjs` + генерація baseline + перевірка навмисних порушень (1 агент, послідовно);
- правки каталогу `.claude/skills/README.md` і вказівників у `server/CLAUDE.md` / `reviewer-core/CLAUDE.md`.
Я сам пишу `SKILL.md`/`tools.md`, зводжу результати агентів у README і роблю фінальну верифікацію.

1. **RED** — 3 Sonnet-агенти без скіла, сценарії:
   - S1: новий модуль «export findings as GitHub comments» (DB + Octokit + Zod).
   - S2: рефактор `pulls/routes.ts` (drizzle у route, агрегати).
   - S3: розміщення — транзакція на 2 repo, виклик іншого модуля, де жити ціні/правилу, нова зовнішня залежність у reviewer-core.
   Записати прогалини.
2. Написати `SKILL.md` + `tools.md` під ці прогалини.
3. dependency-cruiser: config → `pnpm arch` → згенерувати baseline → перевірити, що правила ловлять навмисне порушення (тимчасовий імпорт `drizzle-orm` у `repos/routes.ts`, відкотити).
4. **GREEN** — ті самі сценарії зі скілом; **REFACTOR** — закрити неоднозначності в тексті.
5. README (motivation, TDD-лог, Sources), каталог, CLAUDE.md-вказівники.
6. `mv` цього плану в `docs/cc-plans/2026-09-19+onion-architecture-skill.md`; комітити разом з імплементацією.

## Verification

- `cd server && pnpm arch` → 0 нових порушень (baseline ігнорується).
- Навмисне порушення кожного з правил 1, 4, 5 → `pnpm arch` падає з назвою правила; відкотити.
- `pnpm typecheck` і `pnpm test` у server без змін результату (код не чіпаємо).
- GREEN-агенти: рішення S1–S3 проходять `pnpm arch` концептуально (жодного drizzle поза repo, SDK поза adapters, крос-модульних internals).
- Кожен URL у README відкривається (WebFetch).
