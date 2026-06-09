# Специфікація: AI PR-рев'ювер у CI (DevDigest)

> **Статус:** готова до роботи (M0) · **Дата:** 2026-06-06
> **Пов'язано:** аналіз вартості/моделей — `docs/model-selection-for-pr-reviews.md`

## Зміст
1. [Мета й бачення](#1-мета-й-бачення)
2. [Модель розгортання (студенти курсу)](#2-модель-розгортання)
3. [Стан коду: що вже є (НЕ переписувати)](#3-стан-коду)
4. [Зафіксовані рішення](#4-зафіксовані-рішення)
5. [Білінг і вибір моделі](#5-білінг-і-вибір-моделі)
6. [Архітектура: шов, а не машинерія](#6-архітектура)
7. [`reviewer-core` — день 1](#7-reviewer-core)
8. [`agent-runner` — день 1](#8-agent-runner)
9. [Дистрибуція й рантайм](#9-дистрибуція-й-рантайм)
10. [План реалізації (M0–M5)](#10-план-реалізації)
11. [Ідеї на покращення](#11-ідеї-на-покращення)
12. [Відкриті питання](#12-відкриті-питання)

---

## 1. Мета й бачення

Запакувати нашого **агента-рев'ювера** (system_prompt + skills, створені й відтестовані
у студії DevDigest) так, щоб **репозиторій міг запускати його на кожен pull request**
через GitHub Actions, отримуючи grounded-коментарі на **дешевих моделях** через OpenRouter.

DevDigest-застосунок = **студія** (де агента створюють, тестують, евалять) + **джерело
правди движка**. Той самий движок виконується у двох місцях: на сервері (локальні рев'ю
в UI) і в CI (раннер). Звідси — спільне ядро `reviewer-core`.

## 2. Модель розгортання

**Кожен студент форкає репозиторій собі й працює в ньому як у власному, зі своїми ключами.**
Наслідки (важливо для безпеки й тригерів):

- PR-и — це гілка → `main` **усередині форка студента**; автор PR = власник репо = власник ключа.
- GitHub віддає секрети + `GITHUB_TOKEN` на `pull_request` для PR-ів **із гілок того самого репо** →
  **звичайний `pull_request` працює, `pull_request_target` НЕ потрібен, санітизація НЕ потрібна.**
- Секретів немає лише для PR-ів **із чужого форку** — цього сценарію в моделі курсу немає.
  Якщо станеться (PR від однокурсника) — постинг тихо впаде (ключ не тече). Це graceful
  degradation, достатньо рядка в доці.

## 3. Стан коду

**Це вже існує і працює — M0 НЕ переписує, лише переносить/перевикористовує:**

| Що | Де | Стан |
|---|---|---|
| Чиста зборка промпту + injection-guard | `platform/prompt.ts` (`assemblePrompt`) | ✅ без БД/GitHub |
| Citation grounding gate | `platform/grounding.ts` (`groundFindings`, `groundingSummary`) | ✅ чисте |
| Structured output + reprompt-on-error | `platform/structured.ts` (`toJsonSchema`, `parseWithRepair`) | ✅ чисте |
| Reduce + slice diff | `reviews/helpers.ts` (`reduceReviews`, `sliceDiff`) | ✅ чисті (решта файлу — ні) |
| Map-reduce розгалуження | `reviews/service.ts:353` (`useMapReduce` по порогу рядків) | ✅ працює |
| Постинг рев'ю + inline-коментарів | `adapters/github/octokit.ts:130` (`postReview` з `comments[]`) | ✅ |
| Diff БЕЗ клону | `octokit.listFiles` → `patch` → `diffFromPrFiles` (`service.ts:696`) → `parseUnifiedDiff` (дає `newLineNumbers`) | ✅ доведено |
| Експорт у CI | `ci/service.ts` — генерує workflow + `.devdigest/agents/*.yaml` + skills + `memory.jsonl` | ✅ |
| Інжестія результатів | `ci/actions-client.ts` — опитує Actions API, читає `devdigest-result.json`, upsert `ci_runs` | ✅ |
| Формат агента | `ci/service.ts:269` (`agentYaml`: name/provider/model/system_prompt/skills) | ✅ (формалізувати Zod-ом) |

**Реальний gap — невеликий:** процес у CI, що читає `.devdigest/`, бере diff, кличе чисті
функції й постить. Плюс дрібниці (OpenRouter baseURL, `Provider` enum, рядки в `pricing.ts`).

## 4. Зафіксовані рішення

- **CI-платформа:** GitHub Actions; інші — через генеричний `cli`-таргет (той самий патерн).
- **Підхід:** **Варіант A** — власний рантайм (`agent-runner`) + спільне ядро `reviewer-core`.
  НЕ `claude-code-action`/`gh-aw`, бо вони втрачають наш structured `Review` + grounding-gate.
- **Ядро виносимо як ШОВ, не як машинерію.** `reviewer-core` — vendored-папка через
  tsconfig path-аліас (як уже зроблено для `@devdigest/shared`). Внутрощі — **сьогоднішні
  прості** (один `if` map-reduce). Strategy-registry / token-budgeter / multi-agent —
  **відкладено** до появи другої реальної поведінки (див. §7, «точки розширення»).
- **OpenRouter:** не новий клас, а **`baseURL?` у `OpenAIProvider`** (OpenRouter — OpenAI-сумісний).
  Ключ — у GitHub **Secrets** (не Variables — ті світяться в логах).
- **Стратегія рев'ю:** `single-pass` за замовчуванням; `map-reduce` (per-file) — фолбек на
  великі diff (поріг уже є). `multi-agent` — пізніше.
- **Білінг:** **pay-per-token API** (підписки заборонені/непридатні для CI).
- **fork-PR:** закрито — звичайний `pull_request`, без `pull_request_target` (див. §2).

## 5. Білінг і вибір моделі

**API, не підписка.** Claude Code Pro/Max — ToS Anthropic забороняє CI/CD. z.ai API Platform
pay-per-token — ок; GLM Coding Plan (підписка) — ні.

**OpenRouter vs прямо.** OpenRouter = роутер (ціна провайдера + ~5%), дає один ключ/баланс +
failover + вибір найдешевшого хоста. Пряме підключення дешевше на ~5% + кеш, але це центи/міс
при нашому обсязі. **Рішення:** OpenRouter поки обираємо модель; пряме — після фіксації + росту обсягу.

Виміряно на реальному diff (3827 рядків = 50 868 токенів, 47 файлів), single-pass, ~5k reasoning:

| Рівень | Модель | 1 рев'ю | Нотатка |
|---|---|---|---|
| Безкоштовно | GLM-4.7-Flash | $0.00 | baseline для евалів |
| Ультра-дешево | GLM-4.7-FlashX / DeepSeek V4 Flash | $0.006 / $0.009 | reasoning майже free |
| Доведена ≥Sonnet | **MiniMax M2.5** | $0.024 | 80.2% SWE-bench Verified |
| Преміум | **GLM-5.1** | $0.105 | #1 SWE-bench Pro (70) |
| _Якір_ | _Claude Sonnet 4.6_ | _$0.26_ | _79.6 Verified / 64 Pro_ |

**Дефолт:** DeepSeek V4 Flash / GLM-4.7-FlashX. **Важелі економії:** single-pass замість
map-reduce (×4–10), виключення boilerplate (lock-файл = 41% diff). Деталі — `docs/model-selection-for-pr-reviews.md`.

## 6. Архітектура

Межа: **core = мозок (чиста логіка), runner = руки (увесь I/O), server = другий споживач того ж мозку.**

| | `reviewer-core` | `agent-runner` | `server` |
|---|---|---|---|
| Роль | чиста логіка рев'ю | I/O-обгортка в CI | студія + web/БД |
| Знає про GitHub/FS/БД | **НІ** (лише LLM через інжект) | так (octokit, fs, env) | так (БД, SSE) |
| Споживає core | — | ✅ | ✅ (після міграції `runOneAgent`) |

```
apps/                              ← цей repo (standalone-проєкти, vendored shared)
├── client/                       Next.js студія
├── server/    студія + джерело правди движка (мігрує runOneAgent на reviewer-core)
├── mcp/                          MCP + pre-push CLI
├── reviewer-core/   ← НОВЕ: чисте ядро (vendored shared, без БД/GitHub)
└── agent-runner/    ← НОВЕ: GitHub Action (action.yml + entry, consume reviewer-core)
```

**Переюз без workspace:** tsconfig path-аліас `@devdigest/reviewer-core → ../reviewer-core/src`
у server і runner. При бандлі runner'а (`ncc`) ядро інлайниться в `dist/index.js`.

## 7. `reviewer-core` — день 1

Чистий движок: **given (diff + AgentManifest + LLM-клієнт) → grounded findings + review.**
Жодного FS/GitHub/БД; єдиний побічний ефект — виклик LLM через **інжектований** провайдер.

```
reviewer-core/src/
├── index.ts            ← barrel: reviewPullRequest() + реекспорт типів
├── review/run.ts       ← reviewPullRequest: розгалуження + СПІЛЬНИЙ grounding пост-крок
├── prompt.ts           ← git mv platform/prompt.ts
├── grounding.ts        ← git mv platform/grounding.ts
├── llm/structured.ts   ← git mv platform/structured.ts
└── review/reduce.ts    ← ВИТЯГТИ reduceReviews + sliceDiff з reviews/helpers.ts (НЕ весь файл)
```

Контракти (`Review`, `Finding`, `UnifiedDiff`, `LLMProvider`, `StructuredRequest/Result`)
**уже в `@devdigest/shared`** — core їх імпортує, не дублює. Додаємо туди лише:
`AgentManifest` (Zod) + `'openrouter'` у `Provider` enum.

```ts
// review/run.ts — внутрощі = рівно те, що runOneAgent робить СЬОГОДНІ
export interface ReviewInput {
  agent: AgentManifest;           // provider/model/system_prompt/skills/strategy
  diff: UnifiedDiff;
  llm: LLMProvider;               // інжектований (мокабельний)
  memory?: string[]; specs?: string[]; task?: string;
  onEvent?: (e: RunEvent) => void;   // server → SSE, runner → лог
}
export interface ReviewOutcome {
  review: Review;                 // grounded findings
  grounding: string;              // "3/3 passed"
  mode: 'single-pass' | 'map-reduce';
  tokensIn: number; tokensOut: number; costUsd: number | null; raw: string;
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const totalLines = input.diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const mapReduce = totalLines > FILE_MAP_THRESHOLD_LINES && input.diff.files.length > 1;
  // map (per-file sliceDiff) | single (весь diff) → completeStructured(Review)
  // → reduceReviews(partials) → groundFindings(merged, diff)  ← СПІЛЬНИЙ gate
  // ...
}
```

> **Точка розширення (НЕ будувати зараз):** коли з'явиться `multi-agent` чи bin-pack —
> тоді винести розгалуження у `strategies/` + `REGISTRY`. Зараз — один `if`. Викликачі
> (server/runner) звертаються лише до `reviewPullRequest()`, тож рефактор внутрощів їх не зачепить.

### AgentManifest (формалізуємо ІСНУЮЧИЙ формат `agentYaml`, не новий)

```ts
{
  name: string;
  provider: 'openrouter' | 'openai' | 'anthropic';
  model: string;                                  // 'deepseek/deepseek-v4-flash'
  system_prompt: string;
  skills: string[];                               // slug'и → .devdigest/skills/<slug>.md
  strategy?: 'auto' | 'single-pass' | 'map-reduce';  // default 'auto'
}
```

Студія (`CiService.agentYaml`) пише цей формат, runner читає — одна Zod-схема в shared.

## 8. `agent-runner` — день 1

I/O-обгортка в CI. Stateless (без БД; memory — з `.devdigest/memory.jsonl`).

```
agent-runner/
├── action.yml          ← маніфест (inputs: agent|agents|all, post; runs: dist/index.js)
├── tsconfig.json       ← аліас @devdigest/reviewer-core → ../reviewer-core/src
└── src/
    ├── main.ts         ← entrypoint: оркеструє все
    ├── inputs.ts       ← inputs + env (agent slug(и), post mode, OPENROUTER_API_KEY)
    ├── load-agents.ts  ← .devdigest/agents/*.yaml + skills/*.md → AgentManifest[] (Zod)
    ├── github.ts       ← octokit: getDiff(PR) [listFiles→reconstruct], postReview()
    ├── artifact.ts     ← пише devdigest-result.json (для інжестії в дашборд)
    └── local.ts        ← dev-harness: прогін на fixture-diff БЕЗ GitHub (M1)
```

### Потік `main.ts`
```
1. inputs/env
2. load-agents()                  → AgentManifest[]   (fs → Zod)
3. github.getDiff(PR)             → UnifiedDiff  (listFiles patch → reconstruct → parseUnifiedDiff)
4. for агент: reviewer-core.reviewPullRequest({agent, diff, llm: openrouter, ...}) → grounded
5. output → github.postReview()
6. artifact.write(devdigest-result.json)
```
Кроки 3–6 = те саме, що `runOneAgent` робить навколо БД/SSE, але через fs/octokit/artifact.
Спільне (assemble + ground + reduce) = `reviewer-core`.

### Diff у CI (без клону)
Перевикористати наявний шлях: `octokit.listFiles` дає `patch` по файлах → реконструкція як у
`diffFromPrFiles` → `parseUnifiedDiff` (дає `newLineNumbers`, потрібні grounding-у).
**Обробити ліміт API:** великі/бінарні файли приходять без `patch` → залогувати
`N файлів пропущено (no patch)`, щоб «мовчазне рев'ю» не читалось як «все чисто».

### Кілька агентів
- **sequential** (цикл в одному job) для старту; **matrix** — пізніше (паралельно, ізольовані логи).
- Вартість ×N: 10 × дешева модель = копійки.
- Вивід: N окремих рев'ю; зведення через **Compose** (у server уже є) — опційно пізніше.

### Дистрибуція/реліз
- Бандл `@vercel/ncc` → один `dist/index.js`.
- Версіонування: `@v1` (рухомий) + `@v1.2.3` (immutable).
- `uses:` — окремий репо `devdigest/review-action` **або** сабдиректорія `owner/repo/agent-runner@ref`.

## 9. Дистрибуція й рантайм

### Згенерований `.github/workflows/devdigest-review.yml`
```yaml
name: DevDigest Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: devdigest/review-action@v1
        with:
          agent: security-reviewer       # або agents: [...] / all
          post: github-review
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
`checkout` без `fetch-depth: 0` — diff беремо з API, не з локального git.
**TODO M3:** оновити `CiService.workflowYaml` (`ci/service.ts:230`): `OPENROUTER_API_KEY`
замість `OPENAI_API_KEY`, додати `permissions:`.

### Повний цикл
```
PR відкрито/оновлено → Actions → ubuntu-latest:
  checkout → agent-runner: load-agents → getDiff → reviewer-core.run → postReview → result.json
→ коментарі на PR ✅
→ (асинхронно) CiService.ingest() читає 'devdigest-result' → дашборд   ← ВЖЕ Є
```

## 10. План реалізації

| Етап | Зміст | Результат |
|---|---|---|
| **M0** | Виніс ядра (нижче) + `baseURL` у `OpenAIProvider` + `'openrouter'` enum + рядки моделей у `pricing.ts` | core збирається; server далі працює |
| **M1** | `agent-runner/local.ts` ганяє одного агента на fixture-diff → друкує findings | вертикальний зріз без GitHub |
| **M2** | Diff через octokit (listFiles→reconstruct) + постинг на реальний PR | коментарі з'являються |
| **M3** | `action.yml` + workflow → e2e в CI на тестовому форку; оновити `workflowYaml` | e2e на одному агенті |
| **M4** | Кілька агентів (sequential) | мульти-агент |
| **M5** | `devdigest-result.json` + інжестія в дашборд (інжестія вже є) | повний цикл |

### M0 — конкретні кроки
```
# 1. Створити папку + tsconfig аліас (як для @devdigest/shared)
reviewer-core/{package.json,tsconfig.json}   аліас @devdigest/shared → vendored

# 2. git mv (чисті файли — переносяться як є)
git mv server/src/platform/prompt.ts      reviewer-core/src/prompt.ts
git mv server/src/platform/grounding.ts   reviewer-core/src/grounding.ts
git mv server/src/platform/structured.ts  reviewer-core/src/llm/structured.ts
#    у server лишити re-export (import { ... } from '@devdigest/reviewer-core')
#    щоб openai.ts / reviews не зламались

# 3. ВИТЯГТИ (не весь файл) reduceReviews + sliceDiff з reviews/helpers.ts
#    → reviewer-core/src/review/reduce.ts   (вони вже чисті: Review/Finding/UnifiedDiff)

# 4. Написати reviewer-core/src/review/run.ts (reviewPullRequest) — перенести
#    розгалуження + grounding пост-крок з runOneAgent (service.ts:351-423), БЕЗ БД/SSE/intent

# 5. Shared: + AgentManifest (Zod) у contracts/eval-ci.ts; + 'openrouter' у Provider enum
#    (knowledge.ts:155); container.llm('openrouter') → OpenAIProvider з baseURL+OPENROUTER_API_KEY

# 6. Міграція: ReviewService.runOneAgent кличе reviewer-core.reviewPullRequest,
#    а сам лишає тільки I/O (memory/intent/persist/SSE). Тести server мають лишитись зеленими.
```
**Критерій M0:** `reviewer-core` збирається ізольовано; `server` тести зелені; логіка рев'ю
існує в ОДНОМУ місці (не форкнута).

## 11. Ідеї на покращення

**Дешеві й варті зараз:**
- **Ідемпотентний постинг.** `synchronize` тригериться на кожен пуш → раннер крутиться знову
  й наплодить дублікати коментарів. Перед постингом — згорнути/dismiss попереднє рев'ю цього
  агента (маркер у body, напр. `<!-- devdigest:security-reviewer -->`), потім постити нове.
- **Ніколи не мовчати.** Якщо grounding викинув ВСІ знахідки (часто на дешевих моделях) —
  постити summary-only рев'ю + у лог «K знахідок не пройшли grounding, M файлів без patch».
  Інакше зламане рев'ю не відрізнити від чистого PR.
- **Cost-guard (`DEVDIGEST_MAX_COST_USD`).** Захист ключів студентів: якщо diff завеликий —
  деградувати до single-pass / пропустити boilerplate / зупинитись із попередженням, а не
  спалити баланс на map-reduce.

**Структурні (вписуються в шов, без переробок):**
- **`reviewer-core` як ТРЕТІЙ споживач — eval-харнес.** Студія вже евалить агентів; ганяти
  той самий `reviewPullRequest` на golden-PR-set → regression-gate на сам агент при зміні
  промпту/скілів. Це найкраще виправдання спільного ядра й майже безкоштовно після M0.
- **Per-repo override через `.devdigest/config.yaml`.** Студент зі своїм ключем хоче дешевшу/
  дорожчу модель без правки агента — оверайд `model`/`strategy` на рівні репо. Дешево: одне
  поле, читається в `load-agents`.

**Опційні / пізніше:**
- **Findings як GitHub Check-annotations** (через `GITHUB_TOKEN`) додатково до review-коментарів —
  зручніше для CI-гейтів, не засмічує conversation. Добре лягає на `output`-крок.
- **Кеш по `headSha`.** Не перезапускати агента, якщо diff не змінився між тригерами.

## 12. Відкриті питання

- [ ] Запуск N агентів: sequential (M4) → matrix (пізніше). Дефолт — sequential.
- [ ] Вивід: N окремих рев'ю vs Compose-зведення — дефолт N окремих, Compose опційно.
- [ ] Дистрибуція: окремий репо `review-action` чи сабдиректорія цього repo для `uses:`?
- [ ] Звірити ToS z.ai щодо CI (якщо колись підемо в прямий доступ/підписку).

**Закрито:** ~~fork-PR~~ (§2 — звичайний `pull_request`, без `pull_request_target`);
~~multi-agent зараз~~ (відкладено, точка розширення в §7); ~~окремий OpenRouter-клас~~
(`baseURL` у `OpenAIProvider`).
