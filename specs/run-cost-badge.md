# Spec: Run Cost Badge

Статус: Approved · 2026-10-14 · пакети: `server`, `client`

## 1. Context
Кожен прогін агента-ревʼюера коштує грошей (LLM-токени), але UI цього не
показує. Дані вже є: `reviewer-core` повертає `ReviewOutcome.costUsd`
(реальний `usage.cost` від OpenRouter, інакше оцінка `tokens × PriceBook`), а
`tokens_in`/`tokens_out` вже зберігаються в `agent_runs`. Проте `run-executor`
відкидає `costUsd`, і жоден GET-роут його не віддає.

Мета: показувати вартість (і токени) кожного прогону у трьох місцях UI без
жодного додаткового виклику моделі.

## 2. User stories
- Як рецензент, у **списку PR** я бачу, скільки коштував останній review
  кожного PR, щоб помічати дорогі PR.
- Як рецензент, у **timeline Agent runs** я бачу токени й вартість кожного
  прогону біля часу запуску, щоб порівнювати агентів/моделі.
- Як автор агента, у **drawer прогону → Stats** я бачу COST поруч із DURATION,
  TOKENS, FINDINGS.

## 3. UI
| # | Екран | Місце | Компонент | Приклад |
|---|-------|-------|-----------|---------|
| 1 | Pull Requests | нова колонка `COST` між STATUS і UPDATED | `RunCostBadge variant="compact"` | `$0.014` / `—` |
| 2 | PR Detail → Agent runs | права колонка картки, під часом запуску | `RunCostBadge variant="detailed"` | `9 119 tok · $0.0013` |
| 3 | Drawer «Agent run · …» → Stats | плитка між TOKENS і FINDINGS | наявний `Stat` + `formatCost` | `$0.06` / `—` |

`RunCostBadge` живе в `client/src/components/RunCostBadge/` (використовується
двома екранами). Форматери — `client/src/lib/format-cost.ts`.

## 4. Acceptance criteria
- **AC1** Прогін зі `status=done` зберігає `agent_runs.cost_usd = outcome.costUsd`
  (може бути `null`, якщо модель невідома прайсу).
- **AC2** Прогін `failed`/`cancelled` → `cost_usd = null`.
- **AC3** `GET /pulls/:id/runs` віддає `cost_usd` у кожному `RunSummary`;
  `GET /runs/:id/trace` віддає `stats.cost_usd` (старі trace без поля → `null`).
- **AC4** `GET /repos/:id/pulls` віддає `PrMeta.cost_usd` = сума не-null
  `cost_usd` прогонів **останнього review-батчу** PR (один виклик Run Review =
  один батч, `agent_runs.review_batch_id`). Немає таких значень → `null`.
  Старі прогони без `review_batch_id` вважаються батчем з одного прогону.
- **AC5** Список PR має колонку COST; `null` → `—`.
- **AC6** Картка прогону показує `{tokens_in+tokens_out} tok · {cost}` під часом.
  `cost=null` → лише токени; немає ні токенів (>0), ні cost → рядка немає
  (failed-прогони без бейджа).
- **AC7** Drawer Stats має плитку COST; `null` → `—`.
- **AC8** Єдиний формат вартості: < $1 → 2 значущі цифри (`$0.014`, `$0.0013`,
  `$0.06`); ≥ $1 → 2 знаки (`$1.24`). Ніколи `$0.00` для відсутніх даних.
  Токени групуються пробілом (`9 119`).
- **AC9** Нуль додаткових викликів LLM; `INJECTION_GUARD` і grounding не змінюються.

## 5. Data & contract changes
- `agent_runs`: `cost_usd double precision NULL`, `review_batch_id uuid NULL`
  (schema → `pnpm db:generate`, міграції руками не правимо).
- Контракти (обидві копії `server/src/vendor/shared` і `client/src/vendor/shared`):
  - `RunStats.cost_usd: number | null`
  - `RunSummary.cost_usd: number | null`
  - `PrMeta.cost_usd: number | null`

## 6. Out of scope
- Вартість частково виконаних failed-прогонів.
- Агрегати по агентах/моделях (Agent Performance) і бюджети.
- Бекфіл історичних прогонів (у них `—`).

## 7. Test plan
- server unit: executor пише `costUsd` на success і `null` на failure; contract fixtures.
- server it (`*.it.test.ts`): сума лише останнього батчу, ігнор `null`, PR без прогонів → `null`.
- client: `format-cost` межі (null, 0.0013, 0.014, 0.06, 1.237); `RunCostBadge`
  обидва варіанти + null; `RunHistory`, `RunTraceDrawer`, `PRRow` рендерять cost.

## 8. Implementation order
1. server schema (`runs.ts`) → `pnpm db:generate`
2. server write: `service.runReview` (batch id) · `run.repo` create/complete · `run-executor` (cost у success, `null` у failure)
3. server read: `listRunsForPull`, `getRunTrace`, `pulls/routes.ts` (сума останнього батчу)
4. контракти в обох `vendor/shared`
5. client: `format-cost.ts`, `RunCostBadge`, `PRRow` + `constants.ts`, `RunHistory`, `TraceBody`, i18n
6. тести · README §API map · INSIGHTS
