# План реалізації: Cost

Специфікація: [spec.md](spec.md). Порядок — знизу вгору (дані → API → UI), кожен крок завершується зеленою перевіркою.
Перед стартом — прочитати `INSIGHTS.md` (корінь, `server/`, `client/`); на Windows міграції перевіряти напряму (`docker exec devdigest-postgres psql -U devdigest -c '\d agent_runs'`).

## Крок 0 — Підготовка
- Переглянути `server/src/db/schema/reviews.ts`: поля `runId`, `kind`, `createdAt` (запит «останнє рев'ю» у `modules/pulls/routes.ts`).
- Підняти стек `./scripts/dev.sh` (pnpm 10). Базова лінія: `cd server && pnpm test`, `cd client && pnpm test` — зелені до змін.

## Крок 1 — Схема БД і міграція (server)
**Файли:** `server/src/db/schema/runs.ts` → `agentRuns`: `costUsd: doublePrecision('cost_usd')` (nullable; зразок — `schema/ci.ts`/`eval.ts`). Індекси не додаємо.
**Дія:** `cd server && pnpm db:generate` → новий файл у `src/db/migrations/` (**не правити вручну** — `.claude/rules/migrations.md`).
**Перевірка:** застосувати (`pnpm db:migrate` або обхід з `INSIGHTS.md` на Windows), `\d agent_runs` показує `cost_usd`.

## Крок 2 — Контракти в ОБОХ копіях `vendor/shared`
Ідентичні правки в `server/src/vendor/shared/…` і `client/src/vendor/shared/…`:
- `contracts/trace.ts`: `RunStats.cost_usd: z.number().nullish()`; `RunSummary.cost_usd: z.number().nullable()`.
- `contracts/review-api.ts`: `ReviewRecord.cost_usd: z.number().nullish()`.
- `contracts/platform.ts`: `PrMeta.cost_usd: z.number().nullish()`.
**Перевірка:** `diff` змінених ділянок між копіями; `pnpm typecheck` у `server/` і `client/` (до оновлення споживачів падатиме — це нормально).

## Крок 3 — Збереження вартості (server)
**Файли:**
- `server/src/modules/reviews/repository/run.repo.ts`: `completeAgentRun(values)` + `costUsd?: number | null` → `.set({ costUsd: values.costUsd ?? null })`; `listRunsForPull` віддає `cost_usd: run.costUsd`.
- `server/src/modules/reviews/repository.ts` (обгортка `completeAgentRun`, ~рядок 151): прокинути `costUsd` у тип `values`.
- `server/src/modules/reviews/run-executor.ts`: з `outcome` (результат `reviewPullRequest`) узяти `costUsd` (`const { tokensIn, tokensOut, grounding, costUsd } = outcome;` ~213), передати в `completeAgentRun` (~243) і в `trace.stats.cost_usd` (~264). Гілки `failed`/`cancelled` (~298, ~424) — `costUsd: null` / `cost_usd: null`.
**Перевірка:** розширити `server/test/reviews.it.test.ts` (блок «agent_runs row populated», ~206): з `MockLLMProvider` (`costUsd: 0.001` на виклик, `adapters/mocks.ts`) — детермінована сума в `agent_runs.cost_usd` і `run_traces.trace.stats.cost_usd`; для failed — `null`.

## Крок 4 — Вартість у відповідях API (server)
**4a. Список PR** — `server/src/modules/pulls/routes.ts`, `GET /repos/:id/pulls`, блок latest-review score (~114–130): у наявний `select` з `t.reviews` додати `runId: t.reviews.runId`, зберегти поруч зі `score` у `latestReviewByPr`; зібрати непорожні `runId` → один запит `select({ id: t.agentRuns.id, costUsd: t.agentRuns.costUsd }).from(t.agentRuns).where(inArray(t.agentRuns.id, runIds))` → `Map`; у `rows.map`: `cost_usd: review?.runId ? (costByRun.get(review.runId) ?? null) : null`.
**4b. Review Runs** — `server/src/modules/reviews/repository/review.repo.ts` (`reviewsForPull`) і `service.ts` (`reviewsForPull`, ~160): отримати вартості запусків тим самим `IN (runIds)` і передати в `reviewToDto` (`modules/reviews/helpers.ts:55`) як додатковий параметр → `ReviewRecord.cost_usd`.
**Перевірка:** розширити `server/test/pulls-status.test.ts` / новий `.it.test.ts`: PR із двома рев'ю різної вартості → у списку вартість **останнього**; без рев'ю → `null`; `run_id = null` або видалений запуск → `null`; score і cost з одного запуску; `GET /pulls/:id/reviews` віддає `cost_usd` кожного рев'ю.

## Крок 5 — Компонент і хелпер формату + i18n (client)
- `client/src/lib/format-cost.ts` — `formatCost(usd, { digits? })` рівно за макетом: `null/undefined` → «—»; без `digits`: `usd < 1` → `$` + `toFixed(3)`, `usd ≥ 1` → `$` + `toFixed(2)` (дрібні суми дають `$0.000`, без «<$0.001»); з `digits` → `$` + `toFixed(digits)` (таймлайн `digits: 4`, трейс `digits: 2`). + `format-cost.test.ts` (null, undefined, 0 → `$0.000`, 0.0004 → `$0.000`, 0.014, 0.999, 1, 1.25, `digits:4` 0.0013 → `$0.0013`, `digits:2` 0.06 → `$0.06`).
- `client/src/components/cost-badge/CostBadge.tsx` (+ `index.ts`, `CostBadge.test.tsx`): за макетом `primitives.jsx` — «—» mono/muted при `null`; інакше `mono tnum`, кольори `--text-secondary`. Компонент **без хуків і без i18n**: `title` приходить пропом від викликача (щоб не залежати від чужого i18n-простору в тестах). **Не** класти в `vendor/ui` (вендорене, не чіпати). Точні сигнатури й код — у [ui.md](ui.md).
- i18n (ключі в тих просторах, які вже використовують компоненти): `client/messages/en/prReview.json` → `list.columns.cost` («Cost»), `list.costTitle` («Cost of this review»), `timeline.runCost` (`"{tokens} tok · {cost}"`); `client/messages/en/runs.json` → `trace.stat.cost` («COST»; `TraceBody` читає простір `runs`, поряд із `trace.stat.duration/tokens/findings`).

## Крок 6 — UI: екрани (client)
1. **Список PR:** `pulls/constants.ts` — `COLUMN_KEYS`: `"cost"` між `"status"` і `"updated"`; `GRID` — додати трек перед останнім (орієнтир макета ~76px: `"1fr 132px 92px 60px 118px 76px 78px"`); `PRRow.tsx` — комірка `<CostBadge usd={pr.cost_usd} title={t("list.costTitle")} />` після Status; перевірити skeleton/header. Точний код усіх чотирьох місць — [ui.md](ui.md).
2. **Таймлайн (2a):** `RunHistory.tsx` — права колонка під `toLocaleTimeString()`: для `status === "done"` рядок `mono tnum` 11px: `{tokens_in.toLocaleString()} tok · {formatCost(cost_usd, { digits: 4 })}`.
3. **Акордеон (2b):** `ReviewRunAccordion.tsx` — `<CostBadge usd={review.cost_usd} title="Cost of this review" />` між блоком score (~101) і `formatWhen(review.created_at)` (~107).
4. **Панель запуску (3):** `TraceBody.tsx` — `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd, { digits: 2 })} />` між Tokens і Findings (макет: `"$" + cost.toFixed(2)`).
**Тести:** оновити `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx` (фікстури з `cost_usd`), додати кейси для `ReviewRunAccordion`, `PRRow`: є вартість, `null` → «—», старий трейс без поля.

## Крок 7 — Наскрізна перевірка
1. `cd server && pnpm typecheck && pnpm test` · `pnpm exec vitest run .it.test` (Docker) · `cd client && pnpm typecheck && pnpm test`.
2. `./scripts/e2e.sh` (hermetic): сидовані PR без запусків дають «—» у Cost; наявні flow мають лишитись зеленими (за потреби додати асерт колонки в `e2e/specs/`).
3. Ручна перевірка: запустити рев'ю на seeded PR (ключ LLM або `MockLLMProvider`) → колонка Cost у списку, `tok · $` у таймлайні, `CostBadge` в акордеоні, COST у панелі запуску; старі запуски — «—».
4. Візуальна звірка з макетом (три екрани, чотири місця).

## Розподіл і оцінка
| Блок | Кроки | Оцінка |
|---|---|---|
| Дані й API | 1–4 | ~4–5 год |
| Клієнт | 5–6 | ~3 год |
| Тести/перевірка | 3–7 | ~2 год |
Кроки 5–6 можна вести паралельно з 3–4 після кроку 2 (контракти зафіксовані).

## Після завершення
Дописати в `INSIGHTS.md` (skill `engineering-insights`) лише суттєве й нове, напр. поведінку `null` при частково невідомих цінах, нюанси міграції/`vendor/shared`, якщо проявились.
