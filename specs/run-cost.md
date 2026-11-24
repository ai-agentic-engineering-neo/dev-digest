# Spec — Run cost (M1)

Показуємо вартість і токени кожного прогону агента-ревʼюера у трьох місцях UI. Нуль додаткових викликів моделі.

## Рішення (узгоджено)
| Тема | Рішення |
|---|---|
| Cost у списку PR | **Сума cost усіх run-ів PR** (усі агенти, усі повторні запуски). Жоден run не має ціни → `—` |
| Зберігання | **Нова колонка `agent_runs.cost_usd`** (numeric, nullable). Пишемо в момент завершення run-а |
| Екран 2 | Рядок у **Timeline** + плашка вердикту / заголовок `ReviewRunAccordion` |
| Немає даних | `NULL` → `—`. `$0.00` показуємо лише якщо провайдер реально повернув 0 |

## Джерело даних
- `reviewer-core` уже повертає `costUsd: number | null` (`reviewer-core/src/review/run.ts`): береться з OpenRouter `usage.cost`, інакше `PriceBook.estimate` (`server/src/platform/price-book.ts`). Якщо хоч один виклик у run-і без ціни → весь run `null`.
- `run-executor.ts` зараз ігнорує `outcome.costUsd` → треба передати в `completeAgentRun`.
- Токени (`tokens_in/out`) вже є в `agent_runs`.

## Екрани

### 1. Pull Requests list (`/repos/:id/pulls`)
- Нова колонка **COST** між `STATUS` і `UPDATED`; компактний формат `$0.014`.
- Дані: `GET /repos/:id/pulls` → `PrMeta.cost_usd: number | null` = SUM(`agent_runs.cost_usd`) по `pr_id`; `null`, якщо немає run-ів з не-null ціною.
- Агрегація — одним запитом `GROUP BY pr_id` поряд з існуючим запитом latest-score (`modules/pulls/routes.ts`), без N+1.
- `GRID` у `pulls/constants.ts` розширюється на одну колонку; header і `PRRow` узгоджені.

### 2. PR detail → Agent runs
- **Timeline-рядок run-а** (`RunHistory`): справа від токенів/часу — `9,119 tok · $0.0013` (як на дизайні).
- **Плашка вердикту / `ReviewRunAccordion`**: `$0.014 · 8.2K→1.3K` (cost · tokens in→out) поруч зі score.
- Дані: `RunSummary.cost_usd` (`GET` історії run-ів PR). Review → run мапиться через `reviews.run_id`.
- Failed/cancelled run: `cost_usd` = `NULL` (токени 0) → `—`.

### 3. Run trace drawer (сайдбар «Agent run · …»)
- У секції **Stats** додаємо плитку **COST** між `TOKENS` і `FINDINGS`: `$0.06`.
- Дані: `RunStats.cost_usd` у `run_traces.trace` (опційне поле для старих трейсів → `—`).

## Компонент
`RunCostBadge` у `client/src/components/` (або `pulls/[number]/_components/`), два види:
- `variant="compact"` → `$0.014` (список PR, Timeline);
- `variant="detailed"` → `$0.014 · 8.2K→1.3K` (плашка вердикту).
Тримає єдиний `formatCost` (див. нижче) — `TraceBody` Stat теж використовує його.

## Формат вартості (`formatCost(usd: number | null)`)
- `null | undefined` → `—`
- `0` → `$0.00`
- `< $0.01` → 4 знаки (`$0.0013`); `≥ $0.01` → 3 знаки до $1 (`$0.014`), далі 2 (`$1.25`)
- Токени: `8.2K→1.3K` (існуючий `formatTokens` у `RunTraceDrawer/helpers.ts` дає `15k→1.2k` — уніфікувати в один helper).
- Рядки/підписи — через `messages/en/prReview.json` (`list.col.cost`, `trace.stat.cost`).

## Контракти (`@devdigest/shared`)
Змінюємо в `server/src/vendor/shared` **і дзеркалимо в `client/src/vendor/shared`** (копії вже дрейфнули — міняти точково, не перезаписувати файл):
- `PrMeta` (contracts/platform.ts): `cost_usd: z.number().nullable()`
- `RunSummary` (contracts/trace.ts): `cost_usd: z.number().nullable()`
- `RunStats` (contracts/trace.ts): `cost_usd: z.number().nullable().optional()` (старі трейси)
- Zod **3.x**.

## Поза скоупом
- Бюджети/ліміти, агрегати по агентах/періодах (M8 dashboard), перерахунок вартості старих run-ів, зміна PriceBook.
- Не чіпаємо наявні міграції; не видаляємо таблиці майбутніх milestone-ів.

## Acceptance criteria
1. Кожен завершений run з відомою ціною показує cost у Timeline, плашці вердикту і Trace Stats.
2. Список PR має колонку COST = сума run-ів; PR без run-ів/без цін → `—`.
3. Run без даних (failed, старі записи) → `—`, ніколи `$0.00`.
4. Жодного додаткового LLM-виклику; cost береться з уже отриманого `usage`.
5. `pnpm typecheck` + `pnpm test` у server і client зелені; новий `*.it.test.ts` для агрегації.
