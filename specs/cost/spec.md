# Специфікація: Cost (вартість запусків агентів)

Статус: специфікація і UI-контракт ([ui.md](ui.md)) затверджені, реалізація не розпочата · Milestone: M1 («Run cost badge») · Рішення: користувач (уточнення 2026-11-22/23)
Джерело дизайну: `DevDigest Design (standalone).html` — вихідники розпаковано з бандла (`screen_dashboard.jsx`, `prdetail_runs.jsx`, `screen_trace.jsx`, компонент `CostBadge` у `primitives.jsx`).
План виконання: [plan.md](plan.md)

## 1. Мета
Показати, **скільки коштує рев'ю**: у списку PR (вартість останнього рев'ю), у запусках агентів на сторінці PR (вартість конкретного запуску біля часу) і в панелі запуску (Run Trace) у ряду Duration / Tokens / Cost / Findings.

## 2. Що вже є (виявлено в коді)
- `reviewer-core` рахує `costUsd` на кожен LLM-виклик і **підсумовує** його для запуску (`reviewer-core/src/review/run.ts`; `null`, якщо хоч один виклик без ціни). Для OpenRouter береться `usage.cost` з API, інакше оцінка `PriceBook` / статична таблиця `adapters/llm/pricing.ts`; невідома модель → `null`.
- **Не зберігається:** `run-executor.ts` бере з результату лише токени; `agent_runs`, `RunSummary`, `RunStats`, `PrMeta`, `ReviewRecord` не мають поля cost. Компонента `CostBadge` у клієнті немає.

## 3. Екрани і місця показу (звірено з макетом)
| # | Екран у макеті | Де в коді | Що саме (за макетом) |
|---|---|---|---|
| 1 | «Pull Requests · Run Review + auto-status + Cost» | `client/…/pulls/` (`COLUMN_KEYS`, `GRID`, `PRRow`) | Колонка **Cost** одразу **після Status**, перед Updated; заголовок «Cost»; комірка — `CostBadge`; значення = вартість **останнього рев'ю** (підказка «Cost of this review») |
| 2a | «PR Detail · Agent runs» — Timeline | `…/[number]/_components/RunHistory/RunHistory.tsx` | У правому стовпчику під часом запуску: `{tokens_in} tok · {cost}` (mono, tabular, дрібний `secondary`); лише для запусків без помилки |
| 2b | «PR Detail · Agent runs» — Review Runs (акордеон) | `…/ReviewRunAccordion/ReviewRunAccordion.tsx` | У заголовку між score і часом: `CostBadge` вартості цього рев'ю |
| 3 | «Run Trace · completed» (панель, напр. General Reviewer) | `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` | Ряд статів: **DURATION · TOKENS · COST · FINDINGS** (Cost між Tokens і Findings) |

> У макеті у списку PR є ще колонка Findings і дропдаун Run Review — у starter їх немає, **не додаємо** (поза скоупом цієї фічі).

## 4. Функціональні вимоги
**FR-1. Збереження.** При завершенні запуску (`status='done'`) `cost_usd` (USD, `double precision`, nullable) записується в `agent_runs` — **нова колонка, а не обчислення з токенів × ціна на читанні**. Значення береться з `costUsd`, який повертає `reviewer-core`. Для `failed`/`cancelled` — `null`. Ціна фіксується на момент запуску.

**FR-2. Контракти (обидві копії `vendor/shared`).**
- `RunSummary.cost_usd: number | null` (таймлайн, 2a).
- `ReviewRecord.cost_usd: number | null | undefined` (`.nullish()`, акордеон 2b; `contracts/review-api.ts`).
- `RunStats.cost_usd: number | null | undefined` (`.nullish()` — **старі трейси в `run_traces` не мають поля й мусять парситись**).
- `PrMeta.cost_usd: number | null | undefined` (`.nullish()`, список PR).

**FR-3. Список PR.** `GET /repos/:id/pulls` повертає `cost_usd` = `agent_runs.cost_usd` запуску **останнього рев'ю** PR. «Останнє рев'ю» — як для `score`: найновіший рядок `reviews` з `kind='review'`; запуск = `reviews.run_id` → `agent_runs.id`. Так Score і Cost в одному рядку описують **той самий запуск**. Немає рев'ю / `run_id` порожній / вартість невідома → `null`.

**FR-4. Таймлайн (2a).** `listRunsForPull` віддає `cost_usd`; `RunHistory` показує рядок `{tokens_in} tok · {cost}` для запусків `done`. «tok» = `tokens_in` (так у макеті). Невідома вартість → «—».

**FR-5. Акордеон Review Runs (2b).** `GET /pulls/:id/reviews` (`reviewsForPull`) віддає `ReviewRecord.cost_usd` = `agent_runs.cost_usd` за `reviews.run_id`; `ReviewRunAccordion` показує `CostBadge` між score і часом.

**FR-6. Панель запуску (3).** `trace.stats.cost_usd` записується при збереженні трейсу; `TraceBody` додає `Stat` COST між TOKENS і FINDINGS. Старий трейс без поля → «—».

**FR-7. Формат — рівно як у макеті (рішення користувача: «виправити по макету»).** Компонент `CostBadge` + хелпер `formatCost`:
- `CostBadge` (список PR, акордеон): `null`/`undefined` → «—» (mono, `text-muted`); `usd < 1` → `$` + 3 знаки (`$0.014`, а `0.0004` → `$0.000`); `usd ≥ 1` → `$` + 2 знаки (`$1.25`). Підказка (`title`): «Cost of this review». **Без** спеціального «<$0.001».
- Таймлайн (2a): `$` + **4 знаки** (`$0.0013`), разом з токенами: `{tokens_in.toLocaleString()} tok · $0.0013`.
- Панель запуску (3): `$` + **2 знаки** (`$0.06`) для будь-якого значення; відсутнє → «—».

**FR-8. i18n.** Нові ключі: `prReview.json` → `list.columns.cost`, `list.costTitle`, `timeline.runCost`; `runs.json` → `trace.stat.cost` (панель запуску читає простір `runs`). `CostBadge` без i18n (підказка — проп). Заголовок акордеона `ReviewRunAccordion` уже містить англійські літерали без i18n — підказка там теж літерал за його конвенцією.

## 5. Крайові випадки
| Випадок | Поведінка |
|---|---|
| Запуски до цієї фічі | `cost_usd = NULL` → «—», **без бекфілу** |
| Модель без ціни (`estimateCost` → null) | `null` → «—», цифру не вигадуємо |
| Хоч один LLM-виклик без ціни (map-reduce) | сума запуску `null` (поведінка `reviewer-core` лишається) |
| PR без рев'ю | «—» |
| Кілька агентів/повторів на PR | у списку — вартість **останнього** рев'ю (як score); сумарна вартість PR не показується |
| `failed`/`cancelled` | `null`; у таймлайні вартість не показується; у списку колонка лишається на останньому **успішному** рев'ю |
| `running` | «—» до завершення |
| Видалення запуску/рев'ю | рев'ю видаляється разом із запуском (`deleteAgentRun`) → список переходить на попереднє рев'ю або «—» |

## 6. Відповідність макету
Відхилень немає: формат (`CostBadge` 3/2 знаки, таймлайн 4 знаки, трейс 2 знаки), порядок статів і місця показу взято з макета. Рішення користувача 2026-11-23 («виправити по макету») скасувало попередню ідею «<$0.001». Єдине доповнення до starter: у таймлайні з'являється текст `{tokens_in} tok · …` (так у макеті; раніше токени там не виводились).

## 7. Поза скоупом
Бекфіл історичних запусків · сумарна вартість усіх запусків PR · часткова вартість невдалих запусків · бюджети/ліміти/алерти · дашборд (Agent Performance) · інші місця макета з вартістю: `VerdictBanner` («CostBadge + tokens»), футер Compose Review («this review cost …»), колонки Multi-Agent — можливий наступний крок · валюти, відмінні від USD · позначки «≈».

## 8. Критерії приймання
1. Після нового успішного рев'ю: `agent_runs.cost_usd` = сума по LLM-викликах (з `MockLLMProvider` — детерміновано) і `run_traces.trace.stats.cost_usd` збігається.
2. Список PR: колонка Cost після Status; для PR з двома рев'ю — вартість **останнього** (збігається зі score в рядку); для нерецензованого — «—».
3. Таймлайн: `{tokens_in} tok · $0.0013` під часом для `done`; `failed` — без вартості.
4. Акордеон Review Runs: `CostBadge` між score і часом.
5. Панель запуску: ряд DURATION · TOKENS · COST (`$0.06`) · FINDINGS; старий трейс без поля не ламає парсинг і дає «—».
6. Обидві копії `vendor/shared` оновлені однаково; `pnpm typecheck` у `server` і `client` зелений.
7. Міграція створена `pnpm db:generate` (не вручну) і застосовується на чистій БД; наявні тести та e2e зелені.
8. Формат покрито unit-тестом: `CostBadge` — `—`, `$0.000` (для 0.0004), `$0.014`, `$0.999`, `$1.25`; таймлайн — `$0.0013`; трейс — `$0.06`.

## 9. Ризики
- **Дрейф `vendor/shared`** (копії вже розійшлися): забути одну з двох → typecheck зелений в одній, падіння в іншій. Мітигація: окремий крок плану й `diff` змінених ділянок.
- **Міграції на Windows:** `pnpm db:migrate` мовчки нічого не робить → перевіряти `\d agent_runs` у контейнері (див. `INSIGHTS.md`).
- **Старі трейси:** обов'язкове поле в `RunStats` зламає парсинг → тільки `.nullish()`.
- **`reviews.run_id` без FK:** може бути `null` або вказувати на видалений запуск → `null`/«—», а не помилка.
- **Продуктивність:** додаткові запити по `agent_runs.id IN (…)` (первинний ключ) — окремий індекс не потрібен.
- **Точність:** `double precision` прийнятна для відображення; суми не для обліку/білінгу.
