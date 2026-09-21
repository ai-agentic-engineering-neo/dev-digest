# Spec — Run cost (вартість прогонів агентів)

Статус: draft · 2026-09-19 · пакети: server, client (reviewer-core без змін)

## 1. Мета

Показати, скільки коштує кожен прогін агента-рев'юера і скільки коштувало рев'ю всього PR.
Модель ми додатково не викликаємо: вартість уже рахується на кожен LLM-виклик, але зараз губиться
між reviewer-core і БД.

## 2. Де показуємо (4 місця)

| # | Місце | Компонент | Що саме | Приклад |
|---|---|---|---|---|
| 1 | Список PR, нова колонка **COST** | `pulls/_components/PRRow` | **сума** cost усіх прогонів цього PR | `$0.014` |
| 2 | Рядок прогону в Timeline (Agent runs) | `[number]/_components/RunHistory` | cost цього прогону, праворуч біля часу | `8:52:51 PM` / `$0.0013` |
| 3 | Сайдбар «Agent run» → секція Stats | `RunTraceDrawer/_components/TraceBody` | 4-та плитка **COST** поруч із Duration / Tokens / Findings | `$0.06` |
| 4 | Плашка вердикту в Review runs | `VerdictBanner` (всередині `ReviewRunAccordion`) | рядок `cost · tokens in→out` | `$0.014 · 8.2K→1.3K` |

## 3. Бізнес-правила

- **R1 — cost прогону** = `costUsd`, який повернув `reviewPullRequest()` (reviewer-core). Там уже
  прийнято таку логіку: для OpenRouter береться реальний `usage.cost` з відповіді, інакше оцінка
  токени × прайс (PriceBook: живий прайс OpenRouter, а якщо його немає, статична таблиця
  `adapters/llm/pricing.ts`). Невідома модель дає `null`.
- **R2 — map-reduce**: cost прогону = сума по чанках. Якщо хоч один чанк без cost, увесь прогін
  отримує `null` (так уже працює `review/run.ts`).
- **R3 — failed / cancelled / running**: cost = `null`, у UI показуємо «—». Якщо в прогону немає
  даних, пишемо «—», **ніколи не «$0.00»**.
- **R4 — справжній нуль** (безкоштовна модель, напр. `z-ai/glm-4.7-flash`) показуємо як `$0.00`,
  бо дані є. Відрізняємо `0` від `null`.
- **R5 — cost PR у списку** = сума `cost_usd` **усіх** прогонів PR з непорожнім cost (усі агенти, усі
  запуски). Якщо таких прогонів немає, пишемо «—». Видалений з таймлайну прогін випадає і з суми.
- **R6 — старі прогони** (створені до фічі: токени є, cost немає) один раз дооцінюємо з токенів
  × прайс моделі (див. §5.4). Модель без прайсу так і лишається з «—».
- **R7 — нуль додаткових викликів моделі.** Ціни не запитуємо на кожен прогін: беремо з відповіді
  провайдера або з уже закешованого PriceBook.

## 4. Формат відображення

`formatCost(usd: number | null): string` (одна функція на весь клієнт):

| Значення | Вивід |
|---|---|
| `null` / `undefined` | `—` |
| `0` | `$0.00` |
| `0 < x < 0.0001` | `<$0.0001` |
| `0.0001 ≤ x < 0.01` | 4 знаки: `$0.0013` |
| `0.01 ≤ x < 1` | 3 знаки: `$0.014` |
| `x ≥ 1` | 2 знаки: `$1.24` |

Токени в плашці вердикту показуємо компактно: `8.2K→1.3K` (1 знак після коми, суфікс `K`/`M`).
Шрифт для сум `mono tnum`, як у мокапі.

Тултіп на «—»: `No cost data (failed run or unpriced model)`.

## 5. Server

### 5.1 БД
`src/db/schema/runs.ts` → `agentRuns`: додати `costUsd: doublePrecision('cost_usd')` (nullable,
тип як у `eval.ts` / `ci.ts`). Потім `cd server && pnpm db:generate` (міграцію генерує
drizzle-kit, вручну не пишемо).

### 5.2 Запис
- `repository/run.repo.ts#completeAgentRun` і обгортка в `repository.ts`: нове поле
  `costUsd?: number | null` → `.set({ costUsd: values.costUsd ?? null })`.
- `run-executor.ts#runOneAgent` (успішна гілка): `const { tokensIn, tokensOut, costUsd, grounding } = outcome;`
  → передати `costUsd` у `completeAgentRun` і в `trace.stats.cost_usd`.
- Гілки failure/cancel і `failAll`: `costUsd: null` (R3).

### 5.3 Контракти (`src/vendor/shared/contracts/*`, дзеркалити в `client/src/vendor/shared` тим самим змінам)
- `trace.ts` → `RunSummary.cost_usd: z.number().nullable()`.
- `trace.ts` → `RunStats.cost_usd: z.number().nullish()`: `nullish`, бо старі jsonb-трейси цього поля не мають.
- `platform.ts` → `PrMeta.cost_usd: z.number().nullish()`: заповнюється тільки в list-ендпоінті, як `score`.

### 5.4 Читання
- `run.repo.ts#listRunsForPull` → мапити `cost_usd: run.costUsd`.
- `modules/pulls/routes.ts` (`GET /repos/:id/pulls`): поряд із запитом latest-score зробити один
  агрегат
  `select pr_id, sum(cost_usd) from agent_runs where workspace_id = $ws and pr_id in (...) group by pr_id`
  (`SUM` повертає NULL, якщо всі значення NULL, тому R5 виконується само).
  Результат покласти в `cost_usd` кожного `PrMeta`. Треба перевірити, що Drizzle віддає
  `number | null`, а не рядок (`sql<number | null>` + `.mapWith(Number)` лише для не-null).

### 5.5 Backfill старих прогонів (R6)
- `run.repo.ts#backfillRunCosts(db, estimate)`: вибрати `agent_runs` з `cost_usd IS NULL AND
  status = 'done' AND tokens_in > 0 AND model IS NOT NULL`, порахувати
  `estimate(model, tokensIn, tokensOut)`, оновити рядки, для яких вийшло не `null`. Повертає кількість.
- Викликати на старті в `app.ts` одразу після `reapStaleRuns()` через
  `container.priceBook.estimate`, у такому ж try/catch (non-fatal, лог `backfilled N run costs`).
- Процедура ідемпотентна: після першого старту лишаються тільки рядки моделей без прайсу, тож
  наступні старти проходять майже миттєво.
- Обмеження: на старті живий прайс OpenRouter може ще не підтягнутися, тоді оцінка береться зі
  статичної таблиці. Для backfill це прийнятно.

## 6. Client

### 6.1 Спільне
- `src/lib/format.ts` (новий): `formatCost`, `formatTokensCompact`, щоб PR-list і PR-detail не
  імпортували хелпери один в одного.
- `src/components/run-cost-badge/` (cross-route, форма `Name.tsx · index.ts · styles.ts ·
  RunCostBadge.test.tsx`) → `RunCostBadge`, 2 варіанти:
  - `variant="compact"`: `$0.012` (список PR, таймлайн);
  - `variant="detailed"`: `$0.014 · 8.2K→1.3K` (плашка вердикту).
  - Пропси: `costUsd: number | null | undefined`, `tokensIn?`, `tokensOut?`. `null` дає «—» з тултіпом.

### 6.2 Місця
1. **Список PR**: `pulls/constants.ts` `GRID` отримує колонку ~`80px` між Status і Updated.
   Заголовок `list.columns.cost`, у `PRRow` рендеримо `<RunCostBadge variant="compact" costUsd={pr.cost_usd} />`.
2. **Таймлайн**: у `RunHistory` в правій колонці під часом `ran_at` показуємо
   `<RunCostBadge variant="compact" costUsd={r.cost_usd} />`. Для `running` нічого не показуємо, для
   `failed`/`cancelled` показуємо «—».
3. **Сайдбар**: у `TraceBody` Stats додаємо 4-ту плитку `<Stat label={t("trace.stat.cost")} val={formatCost(cost)} />`.
   Джерело cost: `RunSummary.cost_usd` із `usePrRuns` (одне джерело правди, `agent_runs`, яке
   покриває й дооцінені старі прогони), передаємо в `RunTraceDrawer` пропсом `costUsd` зі
   `[number]/page.tsx`.
4. **Плашка вердикту**: `ReviewRunAccordion` знаходить свій run у `usePrRuns` за `review.run_id` і
   передає у `VerdictBanner` нові опційні пропси `costUsd`, `tokensIn`, `tokensOut`, а той показує
   `<RunCostBadge variant="detailed" …/>` у `titleRow`. Контракт `ReviewRecord` **не змінюємо**,
   бо об'єднання йде на клієнті.

### 6.3 Свіжість даних
Коли прогін завершується, клієнт уже інвалідує `["pr-runs", prId]`. Треба перевірити, що
інвалідується й `["pulls", repoId]` (сума в списку). Якщо ні, додати це в той самий обробник.

### 6.4 i18n (`messages/en/prReview.json`)
`list.columns.cost` = "Cost" · `trace.stat.cost` = "Cost" · `cost.none` = "No cost data (failed run or unpriced model)".

## 7. Acceptance criteria

- [ ] Кожен завершений (`done`) прогін з відомою моделлю показує cost у таймлайні, сайдбарі й плашці вердикту.
- [ ] Прогін без даних (failed / cancelled / модель без прайсу) показує «—», а не «$0.00».
- [ ] Безкоштовна модель показує `$0.00`.
- [ ] Колонка COST у списку PR показує суму всіх прогонів PR. PR без прогонів з cost показує «—».
- [ ] Після видалення прогону з таймлайну сума в списку PR зменшується.
- [ ] Старі прогони після рестарту API мають дооцінений cost (якщо модель є в прайсі).
- [ ] Жодного додаткового виклику LLM (перевіряється тестом зі stub LLMProvider: кількість викликів не змінилась).
- [ ] Числа в сайдбарі й у таймлайні для одного прогону збігаються.

## 8. План реалізації (порядок)

1. **Server · schema**: колонка `cost_usd` у `agent_runs`, потім `pnpm db:generate`, `pnpm db:migrate`.
2. **Shared contracts**: `RunSummary.cost_usd`, `RunStats.cost_usd`, `PrMeta.cost_usd`, те саме в client copy.
   Оновити `test/contracts.test.ts`.
3. **Server · запис**: `completeAgentRun(costUsd)`, `run-executor` (success, fail, cancel, failAll), `trace.stats.cost_usd`.
4. **Server · читання**: `listRunsForPull` і агрегат `SUM` у `GET /repos/:id/pulls`.
5. **Server · backfill**: `backfillRunCosts` і виклик в `app.ts` після reaping.
6. **Server · тести**:
   - `reviews.it.test.ts`: після прогону з mock LLM (`costUsd: 0.001` у `adapters/mocks.ts`)
     `GET` runs повертає `cost_usd = 0.001`; failed-прогін повертає `null`.
   - `pulls` list (it-тест): сума по двох прогонах; PR без прогонів дає `null`.
   - backfill (it-тест): рядок `done` без cost отримує cost, рядок невідомої моделі лишається `null`,
     повторний виклик нічого не змінює.
7. **Client · основа**: `lib/format.ts` і `RunCostBadge` з тестами (таблиця з §4, обидва варіанти).
8. **Client · 4 місця**: PRRow і GRID → RunHistory → TraceBody/RunTraceDrawer → ReviewRunAccordion/VerdictBanner, i18n.
9. **Client · тести**: `RunHistory.test` (cost біля часу, «—» для failed), `VerdictBanner.test`
   (detailed-рядок; без пропсів рядка немає), `RunTraceDrawer.test` (плитка Cost), новий `PRRow.test`.
10. **Перевірка**: `pnpm typecheck` + юніт-тести в server і client, `./scripts/dev.sh`, прогнати
    рев'ю й звірити всі 4 місця.
11. Wrap-up через engineering-insights (Phase 3).

## 9. Поза обсягом / відомі обмеження

- Failed-прогін, який встиг витратити токени (наприклад, падіння після LLM-відповіді), показує «—»:
  зараз при помилці токени не зберігаються. Щоб це виправити, треба окремо протягнути часткові usage з reviewer-core.
- Прапорця «реальна ціна чи оцінка» немає: у БД лежить тільки число. Якщо знадобиться, додамо
  `cost_source` пізніше (для цього треба розширити `LLMResult` у reviewer-core).
- CI-прогони (`ci_runs.cost_usd`), Agent Performance і Eval Dashboard ця фіча не зачіпає.
- Кнопка «Run Review» у рядку списку PR з мокапу не входить у цю фічу.
