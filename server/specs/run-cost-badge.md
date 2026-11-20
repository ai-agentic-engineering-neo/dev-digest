# Run Cost Badge — server (M1)

UI-частина → [`client/specs/run-cost-badge.md`](../../client/specs/run-cost-badge.md).

## Мета
Кожен завершений agent run знає свою вартість у USD. Сервер зберігає її в момент завершення
і віддає в GET-роутах: run, trace, список PR.
Нуль додаткових викликів моделі.

## Що вже є (не переписуємо)
- `reviewPullRequest()` уже повертає `costUsd: number | null` (`reviewer-core/src/review/run.ts`).
  Це сума по всіх chunk-ах і retry. Якщо хоч один chunk без ціни, повертається `null`.
- OpenRouter: фактична ціна з `usage.cost` (запит шле `usage: { include: true }`). Якщо її немає,
  ціна береться з `PriceBook` (live `/models`), а за ним — зі статичної таблиці `adapters/llm/pricing.ts`.
- OpenAI / Anthropic: `estimateCost()` за статичною таблицею. Модель, якої немає в таблиці → `null`.
- Сервер зараз це значення **відкидає**: міграція `0009` видалила `agent_runs.cost_usd`.

## Рішення
| Питання | Рішення |
|---|---|
| Де зберігаємо | `agent_runs.cost_usd double precision NULL`, пишемо в `completeAgentRun` |
| Failed / cancelled / running | `cost_usd = NULL` (не трекаємо часткову витрату) |
| Старі run-и (до фічі) | `NULL`, без backfill і без перерахунку на льоту |
| Cost у списку PR | `SUM(cost_usd)` усіх run-ів PR; `SUM` ігнорує NULL; якщо всі NULL → `null` |
| Справжній нуль (безкоштовна модель) | `0`, це реальні дані, а не «немає даних» |

## Контракт (`@devdigest/shared`, **обидві** копії: `server/src/vendor/shared` і `client/src/vendor/shared`)
- `RunSummary.cost_usd: z.number().nullable()`
- `RunStats.cost_usd: z.number().nullish()`. Nullish, бо старі `run_traces` у БД цього поля не мають.
- `PrMeta.cost_usd: z.number().nullish()`. Заповнюється лише у list-ендпоінті, як і `score`.

## Зміни
1. **Схема.** `db/schema/runs.ts` → `costUsd: doublePrecision('cost_usd')`. Потім `pnpm db:generate`,
   міграцію `0010_*` не редагувати руками.
2. **Repo.** `completeAgentRun(values.costUsd?: number | null)` → `.set({ costUsd: values.costUsd ?? null })`.
   Те саме поле додати в тип `ReviewRepository` (`modules/reviews/repository.ts`).
3. **Executor** (`modules/reviews/run-executor.ts`), успішна гілка:
   - `completeAgentRun({ …, costUsd: outcome.costUsd })`;
   - `trace.stats.cost_usd = outcome.costUsd`;
   - рядок у Run Log для звірки:
     `runLog.result(\`Cost: $${cost.toFixed(6)} (${tokensIn} in / ${tokensOut} out)\`)`;
     якщо `cost == null` → `Cost: unknown (no price for <model>)`.

   Гілки failure, cancel і `failAll` не змінюються: cost не передаємо, отже `NULL`.
4. **GET `/pulls/:id/runs`** (`listRunsForPull`) → `cost_usd: run.costUsd`.
5. **GET `/runs/:id/trace`** — нічого не робимо, поле вже приходить у `stats`.
6. **GET список PR** (`modules/pulls/routes.ts`) — поруч із запитом latest-score додати один агрегатний запит:
   `select prId, sum(costUsd) from agent_runs where prId in (…) group by prId` → `cost_usd`.
   Вийде один IN-запит без N+1.

## Тести
- `*.it.test.ts`: `completeAgentRun` зберігає `costUsd`; `listRunsForPull` його віддає; список PR сумує
  тільки non-null, а для PR без даних повертає `null`.
- Перевірити, що мок `adapters/mocks.ts` (`costUsd: 0.001`) проходить наскрізь до `RunSummary`.

## Acceptance
- [ ] Завершений run має `cost_usd` у `/pulls/:id/runs`, `/runs/:id/trace` і в сумі списку PR.
- [ ] Failed / cancelled / running / старі run-и → `null`, ніколи не `0`.
- [ ] Значення в UI = рядок `Cost:` у Run Log = generation у OpenRouter dashboard (звірити на одному прогоні,
      шукати за `session_id` `owner/repo#N:Agent`).
- [ ] Жодного нового LLM-виклику.

## План реалізації (обидва модулі, по порядку)
Кожен крок проходить `typecheck` і тести, після кожного — окремий коміт.
1. **Контракт.** `cost_usd` у `RunSummary`, `RunStats`, `PrMeta`, в обох копіях `vendor/shared`.
2. **Схема і міграція.** `costUsd` у `agent_runs`, `pnpm db:generate`, `pnpm db:migrate`.
3. **Запис.** `completeAgentRun` і executor (DB, `trace.stats`, рядок `Cost:` у log) + it-тест.
4. **Читання.** `listRunsForPull` і сума у списку PR + it-тест.
5. **Client: `formatCost` + `RunCostBadge`** + unit-тест.
6. **Client: три екрани.** Drawer → timeline → список PR, плюс i18n і оновлення тестів.
7. **Ручна перевірка.** Один прогін через OpenRouter: cost у UI = рядок `Cost:` у log = OpenRouter dashboard.
   Потім failed-прогін (`—`) і старий PR (`—`).

## Ризики
- Агенти на OpenAI або Anthropic з моделлю, якої немає в `pricing.ts` (там зараз лише `claude-3-5-*`),
  матимуть `null` → у UI «—». Це чесно, але може виглядати як баг. Агенти з seed працюють на OpenRouter, для них ціна є.
- Сума в списку PR — це «відома» витрата: failed-прогони, які теж коштували токенів, у неї не входять.
