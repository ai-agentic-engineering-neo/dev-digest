# План скіла `onion-architecture`

Скіл, що форсить Onion Architecture для backend-модулів DevDigest (`server/`,
`reviewer-core/`). Не загальна теорія — правила, прив'язані до інструментів, які
тут реально використовуються.

## 1. Бекенд-стек, на який форситься архітектура

| Інструмент | Роль в Onion | Джерело |
|---|---|---|
| Fastify 5 + `fastify-type-provider-zod` | driving adapter (транспорт) | `server/src/modules/*/routes.ts` |
| Drizzle ORM + Postgres/pgvector | driven adapter (персистенція) | `server/src/modules/*/repository.ts`, `src/db/` |
| Zod (`@devdigest/shared`) | контракти на межі + порти | `src/vendor/shared/{adapters,contracts}` |
| `Container` (ручний DI) | composition root | `src/platform/container.ts` |
| octokit / simple-git / openai / anthropic / ast-grep / tiktoken | driven adapters | `src/adapters/*` |
| `reviewer-core` | domain + domain services (вже чистий) | `reviewer-core/src` |
| Vitest (`*.test.ts` / `*.it.test.ts`) | тести по шарах | `TESTING.md` |
| `dependency-cruiser@17` | **вже в залежностях** — механізм форсингу | `server/package.json` |

ESLint у репозиторії немає взагалі, тому enforcement будуємо на
`dependency-cruiser`, а не на `eslint-plugin-boundaries`.

## 2. Мапа шарів Onion → DevDigest

Правило одне: **залежності тільки всередину**. Зовнішній шар знає про внутрішній,
внутрішній про зовнішній — ніколи.

| Шар Onion | Що це тут | Де живе |
|---|---|---|
| Domain Model | Finding, Severity, Score, Diff, PrMeta + їх інваріанти | `reviewer-core/src`, нове `server/src/domain/` |
| Domain Services | grounding gate, scoring, збірка промпта | `reviewer-core/src/{grounding,prompt}.ts` |
| Application Services (use cases) | `runReview`, `importPr`, `addRepo`, `indexRepo` | `server/src/modules/<name>/service.ts` |
| Ports | `LLMProvider`, `GitClient`, `GitHubClient`, `SecretsProvider`, `CodeIndex`, `Embedder` + **нові порти репозиторіїв** | `src/vendor/shared/adapters.ts` |
| Driven adapters | Drizzle-репозиторії, octokit, simple-git, LLM-провайдери | `src/modules/*/repository.ts`, `src/adapters/*` |
| Driving adapters | Fastify-роути, SSE, `JobRunner`-хендлери | `src/modules/*/routes.ts`, `platform/{sse,jobs}.ts` |
| Composition root | `Container` — єдине місце, де є `new` конкретних класів | `src/platform/container.ts` |

`reviewer-core` уже є еталоном ядра («Stay pure. No DB, network, filesystem»), і
скіл робить цю вимогу загальною, а не локальною для одного пакета.

## 3. Що зараз порушено (baseline, перевірено grep-ом)

1. **Роут ходить у БД повз сервіс і репозиторій** — `drizzle-orm` + `db/schema.js`
   імпортуються прямо в `modules/polling/routes.ts`, `modules/pulls/routes.ts`,
   `modules/settings/routes.ts`, `modules/workspace/routes.ts`. Зовнішній шар
   пробиває всі внутрішні.
2. **Service locator замість портів** — 5 сервісів приймають увесь `Container`
   (`reviews/service.ts:33`, `agents/service.ts:54`, `repos/service.ts:36`,
   `repo-intel/service.ts:104`, `reviews/run-executor.ts:45`). Справжні залежності
   не видно з сигнатури, підмінити одну в тесті не можна.
3. **Тип персистенції тече в application-шар** — `ReviewService.resolveTargets()`
   повертає `Promise<AgentRow[]>`, тобто `typeof agents.$inferSelect`.
4. **Репозиторії не мають інтерфейсів** — `AgentsRepository` / `ReviewRepository`
   створюються в контейнері як конкретні класи; порт відсутній.
5. Доменних типів як таких немає: правила живуть у `service.ts` + `helpers.ts`.

Ці п'ять пунктів — робочий список і водночас набір тест-кейсів для скіла.

## 4. Структура скіла

Формат — як у `fastify-best-practices` (`SKILL.md` + `rules/`), щоб лягло в
наявний каталог `.claude/skills/`.

```
.claude/skills/onion-architecture/
├── SKILL.md            # коли застосовувати, правило залежності, мапа шарів, чеклист
├── rules/
│   ├── layers.md              # шари, напрям залежностей, іменування, де що лежить
│   ├── fastify-transport.md   # роут = driving adapter і нічого більше
│   ├── drizzle-persistence.md # репозиторій = driven adapter, row→domain мапінг
│   ├── ports-and-di.md        # вузькі порти замість Container, composition root
│   ├── zod-contracts.md       # parse at the boundary; контракт ≠ доменна модель
│   ├── domain-purity.md       # що ядру заборонено імпортувати
│   ├── testing.md             # піраміда тестів по шарах
│   └── enforcement.md         # dependency-cruiser + CI
├── examples.md         # до/після на реальному `modules/pulls/routes.ts`
├── references.md       # джерела
└── tile.json
```

## 5. Зміст правил (по одному тезису на файл)

**layers.md** — таблиця з §2 як нормативна; додавання нової можливості починається
з внутрішнього шару назовні; новий модуль = `domain/` (за потреби) → `service.ts`
→ `repository.ts` → `routes.ts`.

**fastify-transport.md** — роут робить рівно чотири речі: Zod-схема в `schema:`,
дістати контекст, викликати один метод сервісу, змапити помилку в HTTP-код.
Заборонено: `drizzle-orm`, `db/schema`, `db/rows`, бізнес-умови, збірка DTO.
Схема оголошується декларативно (проєкт уже це вимагає), `Schema.parse(req.body)`
руками — ні.

**drizzle-persistence.md** — `$inferSelect` не перетинає межу репозиторію; назовні
йде доменний тип або DTO. Інтерфейс репозиторію (порт) живе поруч із application-шаром,
Drizzle-реалізація — окремо. Транзакція — це Unit of Work на рівні use case, а не
деталь усередині одного методу. Міграції та схема — деталь інфраструктури, домен про
них не знає.

**ports-and-di.md** — конструктор приймає вузькі порти, а не `Container`:
`constructor(private llm: LLMProvider, private repo: ReviewRepositoryPort)`.
`Container` лишається composition root і єдиним місцем із `new`. Порт
визначається інтересом того, хто його споживає, а не можливостями бібліотеки.

**zod-contracts.md** — Zod валідує на межі (HTTP-вхід, відповіді LLM, env,
GitHub-відповіді), а не всередині ядра; wire — snake_case, домен — camelCase;
`@devdigest/shared` — контракт транспорту, не доменна модель, і копій у ньому дві.

**domain-purity.md** — ядру заборонені `fastify`, `drizzle-orm`, `postgres`,
`octokit`, `simple-git`, `openai`, `@anthropic-ai/sdk`, `node:fs`, `process.env`.
Нова зовнішня можливість приходить як інжектований порт. `reviewer-core` — зразок.

**testing.md** — домен і use case тестуються герметично з мок-портами
(`src/adapters/mocks.ts`), адаптери — `*.it.test.ts` (суфікс визначає CI-лінію).
Потреба підняти Postgres, щоб перевірити бізнес-правило, — сигнал про протікання шару.

**enforcement.md** — конфіг і команда, див. §6.

## 6. Механізм форсингу

`server/.dependency-cruiser.cjs` + скрипт `arch:check`; `dependency-cruiser` уже
встановлений, нових залежностей не треба.

| Правило | Забороняє |
|---|---|
| `no-routes-to-db` | `modules/*/routes.ts` → `src/db/**`, `drizzle-orm` |
| `no-service-to-drizzle` | `modules/*/service.ts` → `drizzle-orm`, `src/db/schema` |
| `no-domain-to-infra` | `src/domain/**` → fastify / drizzle / octokit / node builtins |
| `reviewer-core-purity` | `reviewer-core/src/**` → БД, мережа, ФС |
| `no-adapter-to-module` | `src/adapters/**` → `src/modules/**` |
| `no-cross-module-internals` | `modules/a/**` → `modules/b/{repository,helpers}.ts` |
| `no-circular` | цикли імпортів |

Три рівні: конфіг ловить дрейф у CI, `SKILL.md` пояснює агенту, як писати код, що
проходить, `examples.md` показує рефакторинг. Правила спершу `warn` (baseline із §3
червоний), після Фази 4 — `error`, плюс крок у `.github/workflows/server.yml`.

## 7. Фази

| Фаза | Обсяг | Ризик |
|---|---|---|
| 0 | написати скіл — жодних змін коду | нульовий |
| 1 | `.dependency-cruiser.cjs` у `warn` + `pnpm arch:check`, зафіксувати baseline | нульовий |
| 2 | 4 роути з §3.1 → `service.ts` + `repository.ts` | низький, механічний |
| 3 | `Container` у конструкторах → вузькі порти (5 сервісів) | середній, зачіпає тести |
| 4 | `AgentRow` та інші row-типи прибрати з публічних сигнатур | середній |
| 5 | `warn` → `error`, крок у CI | нульовий |

Фази 0–1 самодостатні: скіл корисний одразу, навіть якщо рефакторинг не почнеться.

## 8. Критерії приймання

- `pnpm arch:check` зелений у `server/` і `reviewer-core/`.
- Жоден `routes.ts` не імпортує `drizzle-orm` чи `src/db/**`.
- Жоден конструктор у `src/modules/**` не приймає `Container`.
- Публічні сигнатури сервісів не згадують `*Row`.
- Кожен адаптер має порт у `vendor/shared/adapters.ts` і мок у `adapters/mocks.ts`.
- `server/CLAUDE.md` § Conventions посилається на скіл одним рядком.

## Джерела

Першоджерела:
- [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/)
- [Alistair Cockburn — Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
- [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
- [Herberto Graça — Ports & Adapters Architecture](https://medium.com/the-software-architecture-chronicles/ports-adapters-architecture-d19f2d476eca)
- [Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- [Microsoft Learn — Common web application architectures (Clean/Onion)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
- [Microsoft Learn — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

TypeScript / Node:
- [Wolk Software — Implementing SOLID and the onion architecture in Node.js with TypeScript](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs)
- [Melzar/onion-architecture-boilerplate](https://github.com/Melzar/onion-architecture-boilerplate)
- [onicagroup/hexagonal-example (TypeScript)](https://github.com/onicagroup/hexagonal-example)
- [DEV — Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Eric Damtoft — Onion vs Clean vs Hexagonal Architecture](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)

Інструменти й enforcement:
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [Avoid cross-module dependencies with dependency-cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries) (альтернатива, якщо в репо зʼявиться ESLint)
- [Steve Kinney — Architectural Linting](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise)
- [Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) · [Repository pattern with Drizzle](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [You might not need the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b) — контраргумент, врахований у §5
- [Zod](https://zod.dev/) · [Runtime validation with Zod](https://www.api-contract-testing.com/schema-design-validation-patterns/runtime-validation-with-zod/)
