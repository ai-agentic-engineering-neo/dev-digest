# Специфікація: Eval-харнес для агентів і скілів (DevDigest)

> **Статус:** готова до роботи (E0) · **Дата:** 2026-06-07
> **Пов'язано:** `ai-pr-reviewer.md` (eval = третій споживач `reviewer-core`), `docs/model-selection-for-pr-reviews.md` (cost-quality frontier)

## Зміст
1. [Мета й бачення](#1-мета-й-бачення)
2. [Що таке евал тут (і чим він НЕ є)](#2-що-таке-евал-тут)
3. [Стан коду: що вже є (НЕ переписувати)](#3-стан-коду)
4. [Розриви (gap) між наявним і потрібним](#4-розриви)
5. [Зафіксовані рішення](#5-зафіксовані-рішення)
6. [Рівні евала L0–L3](#6-рівні-евала)
7. [Метрики, які важливі для цього продукту](#7-метрики)
8. [LLM-as-judge](#8-llm-as-judge)
9. [Gold-set: ручний + harvested](#9-gold-set)
10. [Порівняння по моделях (cost-quality frontier)](#10-порівняння-по-моделях)
11. [Дельти: schema / contracts / service / routes](#11-дельти)
12. [План реалізації E0–E5](#12-план-реалізації)
13. [Ідеї на покращення](#13-ідеї)
14. [Відкриті питання](#14-відкриті-питання)

---

## 1. Мета й бачення

Дати студії DevDigest **об'єктивну лінійку** для агентів-рев'юверів і скілів: коли студент
міняє промпт / скіл / модель — евал каже **краще чи гірше і за яку ціну**, замість «ну ніби
ок». Це і є наш wedge: жоден існуючий тул не евалить *власного* рев'ювера.

Евал — не «pass/fail юніт-тест», а **інструмент вимірювання й порівняння**: метрики на шкалі
(recall / precision / citation / noise) + порівняння варіантів (модель, промпт, скіл, версія).

## 2. Що таке евал тут

| Це | Не це |
|---|---|
| Вимірювання якості рев'ю на шкалі | Бінарний pass/fail |
| Порівняння варіантів (модель/скіл/версія) → вибір кращого | «Чи воно взагалі запускається» |
| Регресійний гейт при зміні скіла/промпту | Одноразова перевірка |
| Cost-quality frontier по драбині моделей | Вибір «найточнішої» без огляду на ціну |

Детерміновані assert'и (валідний JSON, citation grounding) — це **підлога**, не суть. Суть —
метрики й порівняння поверх.

## 3. Стан коду

**Це вже існує і працює — НЕ переписувати, лише розширювати:**

| Що | Де | Стан |
|---|---|---|
| Таблиці `eval_cases` + `eval_runs` | `db/schema/eval.ts` | ✅ |
| CRUD кейсів | `modules/eval/{routes,repository,service}.ts` | ✅ |
| Запуск кейса (агент на synthetic diff → ground → score) | `eval/service.ts:104` (`runCase`) | ✅ |
| «Run all» по агенту + агрегація | `eval/service.ts:150` (`runAllForAgent`, `aggregate`) | ✅ |
| Детермінований матчер (file + line-overlap + title substring) | `eval/service.ts:346` (`findingMatches`) | ✅ |
| Метрики recall / precision / citation | `eval/service.ts:319` (`score`) | ✅ |
| Citation grounding | `platform/grounding.ts` → `@devdigest/reviewer-core` (`groundFindings`) | ✅ |
| Dashboard: trend + current + delta + regression alert | `eval/service.ts:190` (`dashboard`) | ✅ |
| Контракти API | `vendor/shared/contracts/eval-ci.ts` (`EvalCaseInput`, `EvalRunRecord`, `EvalDashboard`) + `knowledge.ts` (`EvalRun`, `EvalPerTrace`) | ✅ |
| Дії на finding'у персистяться | `db/schema/reviews.ts:42` (`acceptedAt` / `dismissedAt`) | ✅ (поки не задіяні евалом) |

**Поточна семантика (важливо знати перед змінами):**
- `expected_output` — масив *позитивних* очікуваних findings (file/line/title/severity/category).
- `pass = recall === 1 && precision === 1` (`service.ts:115`) — **усе або нічого**.
- `precision = matched / actual`, `recall = matched / expected`, `citation = grounded / raw`.
- Матчинг — **суто структурний**: file + перекриття рядків АБО підрядок title.
- Регресійний alert: `REGRESSION_THRESHOLD = -0.01` (`constants.ts:8`).

## 4. Розриви

| # | Розрив | Чому болить |
|---|---|---|
| **G1** | `pass` бінарний (recall=1 ∧ precision=1) | Реальний рев'ювер майже ніколи не дає 1.0/1.0 → усе «fail», дельта нечитна |
| **G2** | Немає негативних міток (must-NOT-flag) | Не можна виміряти **шум** — а це наш головний wedge |
| **G3** | Матчер лише структурний, немає LLM-судді | Реальний баг поза gold рахується як false positive → **карає за добру поведінку** |
| **G4** | `runCase` прив'язаний до моделі власника-агента | Не можна прогнати той самий набір по драбині моделей (cost-quality frontier) |
| **G5** | Кейси лише ручні; `acceptedAt`/`dismissedAt` не задіяні | Датасет не росте; готова розмітка (Accept/Dismiss/Learn) пропадає |
| **G6** | Евал кличе `assemblePrompt` + `completeStructured` напряму (`service.ts:259`), НЕ `reviewer-core.reviewPullRequest` | Евал тестує **інший** шлях коду, ніж server/CI → евал бреше про прод |
| **G7** | Немає precision-зваженого балу, noise-rate, severity-калібрування | Метрики не відображають цінності продукту (тиша > повнота) |
| **G8** | Немає held-out / захисту від overfit, малий-N шум не оброблений | Тюнинг проти тих самих 20 трас = самообман |
| **G9** | Немає skill-ablation і pairwise (v1 vs v2) | Не видно marginal-внеску скіла; тонкі дельти тонуть у шумі |

## 5. Зафіксовані рішення

- **Евал = третій споживач `reviewer-core`.** `runCase` кличе `reviewPullRequest()`, той самий
  движок, що server і CI-runner. Інакше евал тестує не те, що в проді (закриває **G6**).
- **Шари, не одна «магічна» оцінка.** L0 (assert) + L1 (gold-матчинг, *є*) + L2 (LLM-judge,
  *нове*) + L3 (pairwise, *пізніше*). Детерміноване — спершу; judge — лише для fuzzy-зони.
- **Judge — ОКРЕМА, сильніша модель** через `container.llm(provider)`, ніколи не та сама, що
  тестується (anti self-preference). Judge сам grounded: мусить цитувати рядок.
- **Negative-мітки first-class.** `expected_output` розширюємо: `must_find[]` + `must_not_flag[]`.
- **Бал зважений на precision** (β<1), бо продукт цінує тишу. `pass` лишаємо як булеву позначку,
  але гейт — за порогами метрик, не за `recall=1 ∧ precision=1`.
- **Gold-set росте сам** з `acceptedAt`/`dismissedAt`/learnings (harvest), плюс ручний стабільний
  якір (held-out, не тюнимо проти нього).
- **Cost guard** на judge-виклики й на model-ladder прогони (`DEVDIGEST_MAX_COST_USD`).

## 6. Рівні евала

```
L0  Детерміновані assert'и (0 токенів, кожен run)
    valid JSON · citation grounding (groundFindings) · severity in enum · no dup · no out-of-diff
                                                                    ── вже є (grounding) ──
L1  Gold-set матчинг (структурний)                                  ── вже є (score/findingMatches) ──
    recall(must_find) · precision · noise проти must_not_flag
L2  LLM-as-judge (fuzzy)                                            ── НОВЕ ──
    семантичний матч для неоднозначних · usefulness/real? для findings поза gold · severity-калібр.
L3  Pairwise preference                                            ── ПІЗНІШЕ ──
    v1 vs v2 на тому ж кейсі: яка краща (чутливіше за абсолютні бали на малому N)
```

Правило: **не віддавай LLM-судді те, що assert'иться кодом.** Judge торкається ~10% кейсів
(неоднозначний матч або finding поза gold), не всіх.

## 7. Метрики

Recall — **вторинний**. First-class для цього продукту:

| Метрика | Формула / джерело | Гейт |
|---|---|---|
| **Precision** | matched / actual | головний |
| **Noise-rate** | (actual − matched) / actual, проти `must_not_flag` | головний |
| **Citation accuracy** | grounded / raw (L0, детерміновано) | гейт на галюцинації |
| **Recall** | matched / `must_find` | вторинний |
| **Severity calibration** | confusion expected↔actual severity (off-by-N) | warning |
| **Scope adherence** | скільки `out_of_scope` (з intent) пролізло | warning |
| **Cost / latency** | вже в `eval_runs.costUsd` / `durationMs` | бюджет |

**Зведений бал:** `F-beta` з β = 0.5 (перевага precision). Репортимо і компоненти, і Fβ — щоб
видно було, що саме зрушило.

## 8. LLM-as-judge

**Дві ролі моделей — не плутати:**
1. **Тестований агент** — дешевий (GLM/DeepSeek через OpenRouter), ганяється на gold-set.
2. **Judge** — сильніший (Sonnet/Opus або топ OpenRouter), оцінює спірне.

**Контракт судді (structured, grounded):**
```ts
// judge для одного finding поза gold
JudgeVerdict = {
  is_real: boolean;        // це справжня проблема?
  is_useful: boolean;      // варта коментаря (не нітпік)?
  severity_ok: boolean;    // severity адекватна?
  cited_line: number;      // рядок у дифі, що це доводить (інакше judge галюцинує)
  rationale: string;
}
```

**Дисципліна:**
- Judge ≠ тестована модель (anti self-preference). Pin версію судді.
- **Калібрування проти людини**: на 10–15 кейсах зміряти judge↔human agreement *до* того, як
  довіряти. Низький agreement → евал це театр; підкрутити промпт судді.
- Pairwise (L3): рандомізувати порядок (position bias), нормувати на довжину (verbosity bias).
- Judge — лише L2/L3. Де є детермінована правда (grounding, secret/phantom-гейти) — judge зайвий.

## 9. Gold-set

**Два джерела:**

1. **Ручний якір (held-out).** ~20 розмічених synthetic-diff кейсів. Стабільний, **не тюнимо
   проти нього** — лише міряємо. Зберігається як зараз у `eval_cases` (`input_diff` + `expected_output`).

2. **Harvested з реального вжитку (закриває G5).** Кнопки Accept/Dismiss/Learn = готова розмітка:
   - `findings.acceptedAt != null` → true positive → `must_find`;
   - `findings.dismissedAt != null` → false positive → `must_not_flag`;
   - learning ("не флагай це") → `must_not_flag`.
   
   Джоба `harvestEvalCases`: для PR з діями збирає диф + позитивні/негативні мітки → новий
   `eval_case` (з прапорцем `source = 'harvested'`). Ротується; **не** змішується з held-out якорем.

**Формат `expected_output` (розширений, зворотно-сумісний):**
```ts
{
  must_find: Partial<Finding>[];      // те, що зараз — позитивні очікувані
  must_not_flag?: Partial<Finding>[]; // НОВЕ — відоме-навмисне / шум
}
// старий формат (голий масив) лишається валідним → expectedFindings() вже толерує (helpers.ts:16)
```

## 10. Порівняння по моделях

Це і є «по рівнях моделі»: той самий gold-set → драбина моделей → **якість vs ціна**.

```
POST /eval/compare  { owner_kind, owner_id, models: ['glm-4.7-flashx','deepseek/...','sonnet-4-6'] }
→ для кожної моделі: прогнати набір (reviewPullRequest з override model) → метрики + cost
→ повернути таблицю + позначити "найдешевша, що бере планку precision ≥ threshold"
```

| Модель | Precision | Recall | Noise | $/кейс | Бере планку? |
|---|---|---|---|---|---|
| GLM-Flash | … | … | … | $0.00 | ні |
| DeepSeek V4 | … | … | … | $0.009 | ✅ (дефолт) |
| Sonnet 4.6 | … | … | … | $0.26 | ✅ (якір) |

Реалізація: `runCase` отримує опційний `modelOverride` → `reviewPullRequest({ agent: {...agent, model} })`.
Прогін драбини — `parallel` по моделях з cost-guard. Прямо живить `model-selection`-док.

## 11. Дельти

### Schema (`db/schema/eval.ts`)
```ts
// eval_cases: + джерело й held-out прапорець
source: text('source', { enum: ['manual','harvested'] }).notNull().default('manual'),
heldOut: boolean('held_out').notNull().default(false),
// expected_output (jsonb) — без зміни типу; інтерпретація { must_find, must_not_flag }

// eval_runs: + поля для нових метрик і моделі прогону
model: text('model'),                         // яка модель давала цей run (для compare)
noiseRate: doublePrecision('noise_rate'),
fBeta: doublePrecision('f_beta'),
severityMae: doublePrecision('severity_mae'),
judged: jsonb('judged'),                       // L2 вердикти по findings поза gold
```

### Contracts (`vendor/shared/contracts/eval-ci.ts` + `knowledge.ts`)
```ts
// розширити EvalRun (knowledge.ts): + noise_rate, f_beta, severity_mae (усі nullable, зворотно-сумісно)
// нове:
ExpectedOutput = z.object({ must_find: z.array(...), must_not_flag: z.array(...).default([]) });
JudgeVerdict   = z.object({ is_real, is_useful, severity_ok, cited_line, rationale });
EvalCompareInput  = z.object({ owner_kind, owner_id, models: z.array(z.string()).min(1) });
EvalCompareResult = z.object({ rows: z.array(z.object({ model, recall, precision, noise_rate, f_beta, cost_usd })), best_value_model: z.string().nullable() });
```

### Service (`modules/eval/service.ts`)
- `runOwnerOnDiff` → **замінити** прямий `assemblePrompt`+`completeStructured` на
  `reviewerCore.reviewPullRequest({ agent, diff, llm })` (G6). Приймає `modelOverride`.
- `score` → додати `noise_rate` (проти `must_not_flag`), `f_beta` (β=0.5), `severity_mae`.
  Послабити `pass`: булева позначка лишається, але = пороги (`precision ≥ P0 && recall ≥ R0`).
- **нове** `judgeUnmatched(actual, matchedSet, diff)` — L2: для findings поза gold кличе judge
  (інша модель), результат у `run.judged`; «judge-confirmed real» не рахується як FP.
- **нове** `compareModels(workspaceId, owner, models[])` — драбина (§10), `parallel` + cost-guard.
- **нове** `harvestEvalCases(workspaceId)` — з `acceptedAt`/`dismissedAt` → harvested-кейси (§9).
- **нове** `ablation(agentId, skillId)` — прогін skill on vs off → marginal Δ (G9).

### Routes (`modules/eval/routes.ts`)
```
POST /eval/compare              → compareModels (cost-quality frontier)
POST /eval/harvest              → harvestEvalCases (з реальних дій)
POST /agents/:id/eval/ablation  → ablation (skill on/off)
# наявні (/eval-cases CRUD, /:id/run, /agents/:id/eval/run-all, /eval/dashboard) — без змін
```

### Constants (`modules/eval/constants.ts`)
```ts
export const PRECISION_GATE = 0.7;   // планка precision для pass / best-value
export const RECALL_GATE = 0.6;
export const F_BETA = 0.5;           // перевага precision
export const JUDGE_PROVIDER = 'anthropic';  // окрема сильніша модель
export const MAX_JUDGE_CALLS = 30;   // cost guard на L2 за прогін
```

## 12. План реалізації

| Етап | Зміст | Результат |
|---|---|---|
| **E0** | Евал кличе `reviewer-core.reviewPullRequest` (G6); `modelOverride` у `runCase` | евал тестує прод-шлях; тести зелені |
| **E1** | `must_not_flag` + `noise_rate` + `f_beta`; послабити `pass` на пороги (G1,G2,G7) | метрики відображають wedge (тиша) |
| **E2** | `POST /eval/compare` — драбина моделей, cost-quality frontier (G4) | таблиця «найдешевша, що бере планку» |
| **E3** | `harvestEvalCases` з Accept/Dismiss/Learn (G5) | gold-set росте сам, held-out відділений |
| **E4** | L2 judge: `judgeUnmatched` + калібрування проти людини (G3) | finding поза gold не карається як FP |
| **E5** | `ablation` (skill on/off) + dashboard-делта по скілах (G9); L3 pairwise — за потреби | видно marginal-внесок скіла |

**Критерій E0:** `runCase` не містить власного `assemblePrompt`/`completeStructured` — лише
`reviewPullRequest`; усі наявні eval-тести зелені.

**Критерій E2:** один виклик повертає метрики ≥2 моделей на тому ж наборі + позначений best-value.

## 13. Ідеї

- **Eval як CI-гейт.** Export-to-CI вже є; додати крок «прогнати held-out перед постингом» —
  агент, що впав нижче planки на власному наборі, не деплоїться.
- **Diff-снапшот метрик у PR-брифі.** Коли студент редагує скіл — показати Δ recall/precision
  поруч з кнопкою save (це і є Skill Lab «delta vs last run», тепер з правдивими метриками).
- **Judge-ensemble на спірних** — 3 дешевші судді голосують замість одного дорогого (коли
  калібрування одного судді низьке).
- **Per-category метрики** — recall/precision окремо по security/perf/style: security-recall
  важливіший за style-recall, гейти різні.

## 14. Відкриті питання

- [ ] Планки `PRECISION_GATE` / `RECALL_GATE` — підібрати емпірично на перших 20 трасах.
- [ ] Judge-модель: Anthropic (harness) чи топ-OpenRouter? (узгодити з «дві площини моделей»).
- [ ] Harvested-кейси: автоматично в набір чи через ручний review перед включенням?
- [ ] Скільки held-out тримати недоторканим vs скільки віддати під тюнинг.
- [ ] L3 pairwise — чи потрібен, поки набір малий (≤20)? Дефолт — відкласти.

**Закрито рішеннями (§5):** ~~евал як окремий шлях коду~~ (стає споживачем `reviewer-core`);
~~бінарний pass~~ (пороги + Fβ); ~~лише ручні кейси~~ (harvest); ~~self-judge~~ (окрема модель).
