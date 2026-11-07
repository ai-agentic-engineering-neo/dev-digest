# Development Plan: DevDigest MCP server — аудит і доопрацювання

<!-- Копія: mcp-server/PLAN.md (на прохання користувача). Канонічна версія для /implement-plan — цей файл. -->

- **Status:** done
- **Goal:** у Claude Code (і будь-якому MCP-клієнті) сценарій «зроби рев'ю PR №3 у `lindigo-design/dev-digest` агентом Security Reviewer і скажи, чи є критичні знахідки» проходить `list_agents` → `run_agent_on_pr` → `get_findings` без 402, без дубля платного прогону, з progress/cancel, покритими тестами.
- **Specs:** окремого spec немає. Джерело вимог: `mcp-server/README.md` § «Best practices» (15 пунктів із джерелами) і § «Що свідомо НЕ робимо». Цей план їх не переписує, а перевіряє код на відповідність.
- **Packages:** `mcp-server/` (npm, незалежний) · `reviewer-core/` (лише ліміт `maxTokens`) · root `AGENTS.md`, `.mcp.json`
- **Out of scope:** нові інструменти (`list_repos`, `list_prs` тощо: правило «жодних list-дублікатів»); HTTP/SSE transport; публікація в npm; CI workflow для `mcp-server/`; MCP Tasks extension; скасування прогону DevDigest, коли скасовано MCP-виклик; доступ до БД; реальна реалізація blast radius (HTTP-маршруту немає); зміни в `server/` (жодних нових маршрутів).

## Стан: що вже є (аудит, 2026-11-07)

Код уже написаний (uncommitted, гілка `feat/smart-diff-l03`): `src/{index,server,config,api-client,resolve,format,errors}.ts`, `src/tools/*.ts` (5 інструментів), 24 тести в `test/tools.test.ts` (in-memory Client і fake `fetch`). Наживо перевірено через Inspector CLI. План **не переписує** код, а лише закриває знайдені нижче прогалини.

Скорочення для посилань: `la`=`src/tools/list-agents.ts`, `rap`=`src/tools/run-agent-on-pr.ts`, `gf`=`src/tools/get-findings.ts`, `gc`=`src/tools/get-conventions.ts`, `gbr`=`src/tools/get-blast-radius.ts`, `sh`=`src/tools/shared.ts`, `err`=`src/errors.ts`, `fmt`=`src/format.ts`, `res`=`src/resolve.ts`, `api`=`src/api-client.ts`, `srv`=`src/server.ts` (усі в `mcp-server/`).

### Матриця відповідності

Колонки: **P1** результат, а не операція · **P2** пласкі аргументи · **P3** стисла структурована відповідь · **P4** помилка веде далі · **C1** опис пояснює, КОЛИ викликати · **C2** `.describe()` на кожному полі · **C3** структурована відповідь без зайвого · **C4** помилка підказує наступний крок · **C5** `readOnlyHint` правильний · **C6** повноваження обмежує API, MCP їх не розширює.

| Tool | P1 | P2 | P3 | P4 | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|---|---|---|---|
| `list_agents` | ✅ la:24-38 | ✅ без аргументів (la:17-23) | ✅ la:26-33 (`role` ≤160) | ✅ la:36, err:20-25 | ✅ la:19-20 | ✅ полів немає | ✅ la:8-12,21 | ⚠️ err:31 → **T2** | ✅ la:22 | ✅ лише `GET /agents` (api:98) |
| `run_agent_on_pr` | ⚠️ rap:36-65 ✅, але дублює активний прогін → **T2** | ⚠️ sh:13-20 ✅, але `pr:"3"` відхиляється (sh:18) → **T2** | ✅ fmt:9-34,50-79 | ⚠️ res:10-14,26-29,40-44; err:27-30; sh:37-46 ✅; 402 без конкретики (sh:41) → **T2** | ✅ rap:27-29 | ✅ sh:16,18,20 | ✅ sh:22-28, fmt:131-145 | ⚠️ err:31 → **T2** | ✅ rap:32 (ro false, idem false, destr false) | ✅ `POST /pulls/:id/review` (api:110-118) → rate limit 10/хв `server/src/modules/reviews/routes.ts:29`, workspace `:31` |
| `get_findings` | ✅ gf:25-51 | ⚠️ gf:16-21 ✅, `pr` як у sh:18 → **T2** | ✅ fmt:19-34 | ✅ gf:38,51; fmt:126 | ✅ gf:13-15 | ✅ gf:19 + sh:16-20 | ✅ | ⚠️ err:31 → **T2** | ✅ gf:23 | ✅ лише GET (api:121-127) |
| `get_conventions` | ✅ gc:31-58 | ✅ gc:21-27 (один enum) | ⚠️ немає ліміту ні на список, ні на довжину `rule` (gc:36-46) → **T3** | ✅ gc:52,55-56 | ✅ gc:19-20 | ✅ gc:26 + sh:16 | ⚠️ gc:7-12 (немає `truncated`) → **T3** | ⚠️ err:31 → **T2** | ✅ gc:29 | ✅ лише GET (api:129-131) |
| `get_blast_radius` | ✅ чесна заглушка gbr:13-15,28-30 | ⚠️ gbr:24 ✅, `pr` як у sh:18 → **T2** | ✅ gbr:6-11 | ✅ gbr:13-15 («read the PR diff instead») | ✅ gbr:23 | ✅ sh:16,18 | ✅ | ✅ API не викликає (test/tools.test.ts:311) | ✅ gbr:26 | ✅ без викликів |

**Токени на старті чату (C).** ✅ рівно 5 інструментів у фіксованому порядку (srv:26-30, test/tools.test.ts:20-29). ✅ `instructions` складаються з 3 речень (srv:14-17). ✅ схеми пласкі (test/tools.test.ts:41-44). ✅ `ENABLE_TOOL_SEARCH` задокументовано (README.md:95-101).

### Перевірка підозрюваних прогалин

| Підозра | Вердикт | Доказ → задача |
|---|---|---|
| reviewer-core: виклик рев'ю без `maxTokens` → 402 | **реальна** | `reviewer-core/src/review/run.ts:194-201` не передає `maxTokens`; `reviewer-core/src/llm/openrouter.ts:85` тоді опускає `max_tokens`. Сервер розв'язав таку саму проблему через `EXTRACTION_MAX_TOKENS = 4_000` (`server/src/modules/conventions/constants.ts:18-23`) і `INTENT_MAX_TOKENS = 800`. Порт уже має поле: `StructuredRequest.maxTokens` (`server/src/vendor/shared/adapters.ts:61`), тож vendor не чіпаємо → **T1** |
| дубль платного прогону | **реальна** | `ReviewService.runReview` створює новий `agent_run` без перевірки активних (`server/src/modules/reviews/service.ts:119-129`); rap:43 стартує одразу → **T2** (рішення: приєднуватися до активного прогону) |
| `pr` як рядок `"3"` | **реальна** | `prArg = z.number()` (sh:18) → **T2** (`z.coerce`; JSON schema лишається `{type:"integer"}`) |
| немає тестів progress / cancel / неоднозначного агента / stdio smoke | **реальна** | у `test/tools.test.ts` таких тестів немає. Логіка є: progress rap:57-63, abort rap:7-20, ambiguous res:40-43 → **T2**, **T4** |
| `mcp-server/CLAUDE.md` / `INSIGHTS.md` | **реальна** | їх немає. Рядок у `AGENTS.md:25` веде на README. Skill `engineering-insights` знає лише 4 пакети (`.claude/skills/engineering-insights/SKILL.md:38`) → **T5** + Open question Q3 |
| нова: `.mcp.json` запускає `npx tsx` з кореня, де немає `package.json` | **реальна** | у корені немає `package.json`/`node_modules`, тому `npx` щоразу тягне **непінований** `tsx` з реєстру (supply chain, A03; повільний холодний старт). Для нативного Windows Claude Code радить обгортку `cmd /c` для `npx` → **T5** (`node mcp-server/node_modules/tsx/dist/cli.mjs`) |
| нова: generic `ApiError` без наступного кроку | **реальна** | err:31 повертає `"DevDigest API error 404 not_found: …"` без підказки → **T2** |
| нова: скасування логується як «failed» зі стеком | **реальна** | `guarded` логує все, що не є `ApiError`/`ToolError`, як unexpected (err:48-49), а `sleep` відхиляє з `signal.reason` (rap:9,16) → **T2** |
| нова: `get_conventions` без обрізання | **реальна** | конвенції накопичуються між екстракціями, `rule` можна редагувати без ліміту (`server/src/modules/conventions/routes.ts:65`) → **T3** |

## Global constraints

- `mcp-server/` працює **лише через HTTP API DevDigest**: жодного доступу до БД, жодних імпортів з `server/`, `reviewer-core/` чи `client/`. Workspace scoping і rate limit успадковуються від API (README п. 10).
- **Рівно 5 інструментів**, і жодного нового input-поля (токени на старті, README п. 1, 14). Нові поля відповіді лише опційні або адитивні.
- stdout зарезервовано під JSON-RPC: логи пишемо тільки через `console.error` (`src/index.ts:4`, README п. 11).
- Відносні імпорти з розширенням `.js` (ESM), як у наявному коді. Жодних нових npm-залежностей: `StdioClientTransport` уже є в `@modelcontextprotocol/sdk` v1 (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js`). `package-lock.json` змінюється лише через `npm`.
- SDK лишається v1 (`^1.32.2`), zod `^3.25`. Рішення користувача, не змінювати.
- Рішення користувача, що лишаються як є: platform-neutral підказка «API unreachable»; `DEVDIGEST_RUN_TIMEOUT_MS` = 180 с і `"timeout": 240000`; опційний `agent` у `get_findings`; counts рахуються до обрізки, CRITICAL ніколи не обрізаються; disabled-агент запускається з `warning`.
- Do-not-touch: `*/src/vendor/shared/**`, `server/src/db/migrations/**`, `.claude/**` (зокрема own skills: їх змінює лише користувач, див. Open questions), lockfiles.
- Windows: bins викликаємо через `node`, а не через `pnpm`/`npm run` (`server/INSIGHTS.md` 2026-11-04 Tool & Library Notes).
- Файли з regex і escape-послідовностями пишемо інструментами Write/Edit, а не через bash heredoc (`server/INSIGHTS.md` 2026-11-07: heredoc губить `\`).

## Contracts (Wave 0)

W0 не потрібен: жоден контракт не перетинає межу між задачами. Зміни форм нижче адитивні, і кожною володіє одна задача.

```ts
// T1 — reviewer-core/src/review/run.ts (експортується з src/index.ts)
export const DEFAULT_REVIEW_MAX_TOKENS = 8_000;
interface ReviewInput { /* … */ maxTokens?: number } // кап на КОЖЕН chunk-виклик completeStructured

// T2 — mcp-server/src/tools/shared.ts
export const prArg = z.coerce.number().int().positive().describe('Pull request number, e.g. 3');
// tools/list: properties.pr === { type: "integer", exclusiveMinimum: 0, description } (без anyOf)

// T3 — mcp-server/src/tools/get-conventions.ts (outputSchema, адитивно)
// { repo, status, conventions[{rule, category, evidence, status}], counts{accepted,pending,rejected}, truncated: number }
export const MAX_CONVENTIONS = 50;     // у get-conventions.ts
export const MAX_RULE_CHARS = 300;
// T3 — mcp-server/src/format.ts: export function shorten(text: string, max?: number): string  (лише додано export)

// FindingsResult (fmt:19-33) НЕ змінюється: повторне використання активного прогону повідомляємо через наявне `warning`.
```

## File ownership map

| File | Task | New / Modified |
|---|---|---|
| `reviewer-core/src/review/run.ts` | T1 | modified |
| `reviewer-core/src/index.ts` | T1 | modified |
| `reviewer-core/test/run.test.ts` | T1 | modified |
| `reviewer-core/test/openrouter.test.ts` | T1 | modified |
| `reviewer-core/specs/review-engine.md` | T1 | modified |
| `reviewer-core/docs/providers-and-cost.md` | T1 | modified |
| `mcp-server/src/tools/run-agent-on-pr.ts` | T2 | modified |
| `mcp-server/src/tools/shared.ts` | T2 | modified |
| `mcp-server/src/errors.ts` | T2 | modified |
| `mcp-server/test/helpers/harness.ts` | T2 | modified |
| `mcp-server/test/run-agent-on-pr.test.ts` | T2 | new |
| `mcp-server/src/tools/get-conventions.ts` | T3 | modified |
| `mcp-server/src/format.ts` | T3 | modified |
| `mcp-server/test/tools.test.ts` | T3 | modified |
| `mcp-server/test/stdio.smoke.test.ts` | T4 | new |
| `mcp-server/CLAUDE.md` | T5 | new |
| `mcp-server/INSIGHTS.md` | T5 | new |
| `mcp-server/README.md` | T5 | modified |
| `AGENTS.md` (root; `CLAUDE.md` — symlink) | T5 | modified |
| `.mcp.json` (root) | T5 | modified |

## Tasks

### T1 [W1] [backend] reviewer-core: явний кап `maxTokens` для review-виклику
- **Status:** done
- **Files (only these):** `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/run.test.ts`, `reviewer-core/test/openrouter.test.ts`, `reviewer-core/specs/review-engine.md`, `reviewer-core/docs/providers-and-cost.md`
- **Depends on:** —
- **Produces:** `export const DEFAULT_REVIEW_MAX_TOKENS = 8_000`; опційне `ReviewInput.maxTokens?: number`; кожен `input.llm.completeStructured` у `reviewPullRequest` отримує `maxTokens: input.maxTokens ?? DEFAULT_REVIEW_MAX_TOKENS`.
- **Insights:**
  - `reviewer-core/INSIGHTS.md` 2026-11-07 — Review runs on OpenRouter (`deepseek/deepseek-v4-flash`) fail with `402 … You requested up to 131072 tokens, but can only afford N`: the review's `completeStructured` call passes no `maxTokens`, so `OpenRouterProvider` omits `max_tokens` … → pass an explicit `maxTokens` cap for the review call (src/review/run.ts:194 → reviewPullRequest `completeStructured`; src/llm/openrouter.ts:85 → max_tokens spread).
  - `server/INSIGHTS.md` 2026-11-05 — `llm.completeStructured` without `maxTokens` reserves the model max (65k) → OpenRouter 402 … always pass a cap for structured calls (src/modules/conventions/constants.ts:23).
  - `reviewer-core/INSIGHTS.md` 2026-11-04 — `npm run typecheck` checks only `src/**/*.ts` … type errors in `test/*.ts` never fail locally or in CI → after changing a public type (`ReviewInput`…), type-check the tests explicitly (reviewer-core/tsconfig.json:28 → include).
  - `reviewer-core/INSIGHTS.md` 2026-11-05 — test/run.test.ts:111/:142 мають 2 PRE-EXISTING `TS7006 'req' implicitly any` → baseline; нові помилки = регресія.
  - `reviewer-core/INSIGHTS.md` 2026-11-04 — `test/run.test.ts` imports `MockLLMProvider`/`MockGitClient` from `../../server/src/adapters/mocks.js` (test/run.test.ts:3).
- **Skill focus:** typescript-expert (публічний тип `ReviewInput` без `any`; у новому тесті явно типізуйте `req: StructuredRequest<T>`); жодного I/O чи env у рушії (reviewer-core/CLAUDE.md Hard rules).
- **Steps:**
  1. `run.ts`: поруч із `DEFAULT_REVIEW_MAX_RETRIES` (рядок 32) додати `DEFAULT_REVIEW_MAX_TOKENS = 8_000` з коментарем-причиною (402 на ключах з низьким лімітом, посилання на `server/src/modules/conventions/constants.ts`). У `ReviewInput` додати `maxTokens?: number`. У виклику на рядках 194-201 передати кап.
  2. `index.ts:39-49`: експортувати `DEFAULT_REVIEW_MAX_TOKENS`.
  3. `test/run.test.ts`: тест у стилі рядків 107-137 (recorder `LLMProvider`). Без `maxTokens` кожен виклик отримує `8000`, із `maxTokens: 1234` отримує `1234`.
  3a. `test/openrouter.test.ts` (поруч із тестами `truncated replies`, рядок 30, той самий фейк клієнта): запит з `maxTokens: DEFAULT_REVIEW_MAX_TOKENS` (8000), перша відповідь `finish_reason: "length"` → другий запит іде з `max_tokens: 16000` (= `TRUNCATION_TOKEN_CEILING`) і без repair-промпта; відповідь приймається. Плюс інваріант `DEFAULT_REVIEW_MAX_TOKENS * TRUNCATION_TOKEN_FACTOR <= TRUNCATION_TOKEN_CEILING`, щоб зміна будь-якої з констант не вимкнула повтор непомітно.
  4. `specs/review-engine.md`: рядок `maxTokens` у таблиці входів (поруч із рядком 35 `maxRetries`). `docs/providers-and-cost.md`: одне речення про кап у розділі `completeStructured` (біля рядків 22-50).
  5. `server/` не змінювати: `run-executor.ts:224` отримує дефолт автоматично.
  6. Коміт T1 включає й `reviewer-core/INSIGHTS.md`: інсайт про 402 уже оновлено в основній сесії (незакомічений); implementer його не редагує, лише додає в коміт.
- **Acceptance criteria:**
  - [ ] `reviewPullRequest` без `maxTokens` передає `maxTokens: 8000` у кожен chunk-виклик; override поважається (тест).
  - [ ] Обрізана відповідь при капі 8000 повторюється з `max_tokens: 16000` (тест у `test/openrouter.test.ts`); інваріант констант перевірено.
  - [ ] `DEFAULT_REVIEW_MAX_TOKENS` експортовано з `@devdigest/reviewer-core`.
  - [ ] typecheck reviewer-core = 0 помилок; тести reviewer-core і server unit — зелені.
  - [ ] Тимчасовий typecheck тестів (`include` + `test/**/*.ts`) показує лише 2 baseline-помилки TS7006 (тимчасову зміну tsconfig відкотити).
- **Verify:**
  - `cd reviewer-core && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd reviewer-core && node node_modules/vitest/vitest.mjs run` → all pass
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass

### T2 [W1] [backend] mcp-server: `run_agent_on_pr` без дублів, coerce `pr`, помилки з наступним кроком, progress/cancel-тести
- **Status:** done
- **Files (only these):** `mcp-server/src/tools/run-agent-on-pr.ts`, `mcp-server/src/tools/shared.ts`, `mcp-server/src/errors.ts`, `mcp-server/test/helpers/harness.ts`, `mcp-server/test/run-agent-on-pr.test.ts` (new)
- **Depends on:** —
- **Produces:** `prArg` з `z.coerce` (див. Contracts); повторне використання активного прогону; abort-aware `guarded`; `errorMessage` з наступним кроком для кожного статусу `ApiError`; підказка для 402 у `finishedRunResult`.
- **Insights:** none (mcp-server ще не має INSIGHTS.md). Факт про API: `ReviewService.runReview` не дедуплікує прогони (`server/src/modules/reviews/service.ts:119-129`), `GET /pulls/:id/runs` повертає `status` і `agent_id` кожного прогону (`server/src/modules/reviews/repository/run.repo.ts:40-69`).
- **Skill focus:** zod (coerce без `anyOf` у JSON schema); security (MCP не розширює повноважень: жодних нових endpoint'ів, cancel-прогону не робимо); typescript-expert (без `any` у `guarded`).
- **Steps:**
  1. **Дедуплікація (рішення планувальника):** у `rap` після резолву і **до** `startReview` викликати наявний `deps.api.listRuns(pull.id, signal)` (новий метод у `api-client.ts` не потрібен) і знайти прогін з `status === 'running' && agent_id === found.id`. Якщо він є, `POST` не робити: чекати саме на цей `run_id` у тому ж циклі опитування. У `warning` додати: `Agent "<name>" was already running on <repo>#<pr> (run <id>); waited for that run instead of starting a duplicate paid run.` Якщо є ще й warning про disabled-агента, обидва склеїти через пробіл. Нового input-поля (`force`) не додавати.
  2. `sh:18`: `prArg = z.coerce.number().int().positive().describe('Pull request number, e.g. 3')`. Валідаційна помилка для `"abc"` має прийти як `isError` (SDK v1).
  3. `sh:37-43` (`finishedRunResult`): якщо `run.error` містить `402` або `credits` (без урахування регістру), текст пояснює, що LLM-провайдеру забракло кредитів/ліміту ключа, і радить поповнити ключ або змінити модель агента в DevDigest. Рядки `OpenRouter 402` (з причини) і `retry run_agent_on_pr` **мають лишитися в тексті**: на них спирається `test/tools.test.ts:157-158`.
  4. `err:31`: до повідомлень `ApiError` (крім 429) додати наступний крок за статусом. 404: перевірити `list_agents` / repo / номер PR і повторити. 400 і 422: перевірити аргументи. ≥500: дивитися лог DevDigest API і повторити. Інші: повторити, а якщо не допомагає, дивитися лог. **Не змінювати** тексти 429 (`test/tools.test.ts:175` — exact) та unreachable (`:184-186`).
  5. `guarded` (err:37-54): якщо signal виклику (`extra.signal` в останньому аргументі handler'а) уже aborted, писати в stderr один рядок `[devdigest-mcp] <tool>: cancelled by client` без стеку і повертати `toolError('Cancelled by the client.')`. Причина: `signal.reason` може бути рядком, а не `Error` (rap:9,16).
  6. `harness.ts`, лише адитивно (`test/tools.test.ts` належить T3 і має лишитися зеленим без змін): у `FakeState` додати `trackedRunId?: string` (дефолт `'run-new'`), щоб `runStatusSequence` і створення review працювали й для заздалегідь доданого `running`-прогону. Опційно `onCall?: (call: string) => void` для тесту скасування.
  7. `test/run-agent-on-pr.test.ts` (новий; `setup` як у `test/tools.test.ts:11-15`):
     - **active run reuse:** `state.runs` має `running`-прогін `agent-sec`, тоді немає `POST /pulls/:id/review`, `run_id` дорівнює id цього прогону, а `warning` містить `already running`. Прогін іншого агента в статусі `running` дедуплікацію **не** вмикає.
     - **progress:** `client.callTool(params, undefined, { onprogress })` з `runStatusSequence: ['running','running','done']` дає ≥ 2 сповіщення зі строго зростаючим `progress`. Без `onprogress` сповіщень немає.
     - **cancellation:** `AbortController` у `callTool(..., { signal })`, abort після першого progress. Проміс відхиляється, а кількість `GET /pulls/:id/runs` після abort не росте протягом кількох `pollMs`.
     - **ambiguous agent:** два агенти з ім'ям `Security Reviewer` дають `isError`, текст містить обидва id і `Pass the id`, `POST` немає.
     - **pr як рядок:** `pr: "3"` дає `status: "done"`, а `pr: "abc"` дає `isError`. У `tools/list` поле `pr` має `type: "integer"` без `anyOf`.
     - **402 hint** і **404 next step** (`reviewStatus`-подібний перемикач у harness для `POST`, якщо потрібен, теж адитивний).
- **Acceptance criteria:**
  - [ ] Повторний `run_agent_on_pr` того ж агента на тому ж PR під час активного прогону не створює нового прогону (тест).
  - [ ] progress-сповіщення монотонні; після cancel опитування зупиняється; у stderr немає стеку для скасування.
  - [ ] `pr: "3"` приймається; JSON schema `pr` лишається пласкою (`integer`).
  - [ ] Кожна гілка `ApiError` (окрім 429/unreachable, які не змінюються) містить наступний крок.
  - [ ] Увесь наявний `test/tools.test.ts` зелений **без змін** у ньому.
- **Verify:**
  - `cd mcp-server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd mcp-server && node node_modules/vitest/vitest.mjs run test/run-agent-on-pr.test.ts test/tools.test.ts` → all pass

### T3 [W1] [backend] mcp-server: обрізання `get_conventions`
- **Status:** done
- **Files (only these):** `mcp-server/src/tools/get-conventions.ts`, `mcp-server/src/format.ts`, `mcp-server/test/tools.test.ts`
- **Depends on:** —
- **Produces:** `MAX_CONVENTIONS = 50`, `MAX_RULE_CHARS = 300`, поле `truncated: number` в outputSchema; `export function shorten` у `format.ts` (без зміни поведінки).
- **Insights:** none.
- **Skill focus:** zod (адитивне поле outputSchema, `z.number().int()`); принцип P3 (counts рахуються по всіх, до обрізки, як у `fmt:50-79`).
- **Steps:**
  1. `fmt:41`: додати `export` до `shorten`, нічого більше не змінюючи.
  2. `gc`: після фільтра (gc:36) взяти перші `MAX_CONVENTIONS` у порядку API. `rule` пропустити через `shorten(rule, MAX_RULE_CHARS)`. `truncated` дорівнює кількості відкинутих. `counts` і далі рахуються по **всіх** конвенціях. Якщо `truncated > 0`, текст `content` закінчується рядком `(<N> more conventions omitted; see Skills Lab → Conventions in DevDigest.)`.
  3. `test/tools.test.ts:287-292`: додати `truncated: 0` в очікуваний `toEqual`. Новий тест: 60 accepted конвенцій, одна з `rule` довжиною 1000 символів. Очікуємо 50 у списку, `truncated: 10`, `counts.accepted: 60`, `rule` ≤ 300 символів.
  4. Інших тестів у файлі не чіпати: на harness, який змінює T2, вони спираються адитивно.
- **Acceptance criteria:**
  - [ ] Відповідь `get_conventions` ніколи не має більше 50 правил, а кожне правило ≤ 300 символів; `truncated` і `counts` коректні (тест).
  - [ ] `tools/list` і далі показує 5 інструментів, і в кожного є `outputSchema`.
- **Verify:**
  - `cd mcp-server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd mcp-server && node node_modules/vitest/vitest.mjs run test/tools.test.ts` → all pass

### T4 [W1] [backend] mcp-server: stdio smoke-тест реального процесу
- **Status:** done
- **Files (only these):** `mcp-server/test/stdio.smoke.test.ts` (new)
- **Depends on:** —
- **Produces:** тест, який запускає `src/index.ts` як окремий процес через `StdioClientTransport` з `@modelcontextprotocol/sdk/client/stdio.js`.
- **Insights:** none.
- **Skill focus:** security (stdout чистий: будь-який не-JSON рядок у stdout ламає клієнт); жодних фіксованих `sleep` для очікування готовності, бо `client.connect` сам чекає `initialize`.
- **Steps:**
  1. Transport: `command: process.execPath`, `args: [<abs>/node_modules/tsx/dist/cli.mjs, <abs>/src/index.ts]` (шляхи відносно файлу тесту через `fileURLToPath(new URL('..', import.meta.url))`), `env: { ...getDefaultEnvironment(), DEVDIGEST_API_URL: 'http://127.0.0.1:9' }`, `stderr: 'pipe'`.
  2. Перевірити: `listTools()` повертає рівно 5 імен у порядку з `srv:26-30`. `get_blast_radius` повертає `status: "not_implemented"`. `list_agents` повертає `isError: true` з текстом `unreachable at http://127.0.0.1:9`. У stderr є `[devdigest-mcp] ready`. `transport.onerror` не спрацював жодного разу (stdout чистий).
  3. `afterAll`: `client.close()`, процес завершено. Таймаут тесту 30 с (на Windows відмова з'єднання з localhost триває ~1–2 с).
- **Acceptance criteria:**
  - [ ] Тест зелений на Windows і не залишає дочірніх процесів (`client.close()` в `afterAll`).
  - [ ] Тест падає, якщо додати `console.log` у `src/index.ts`. Implementer перевіряє це вручну мутацією й відкочує її.
- **Verify:**
  - `cd mcp-server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd mcp-server && node node_modules/vitest/vitest.mjs run test/stdio.smoke.test.ts` → pass

### T5 [W2] [backend] Гігієна пакета: CLAUDE.md, INSIGHTS.md, README, `.mcp.json`, AGENTS.md
- **Status:** done
- **Files (only these):** `mcp-server/CLAUDE.md` (new), `mcp-server/INSIGHTS.md` (new), `mcp-server/README.md`, `AGENTS.md`, `.mcp.json`
- **Depends on:** T2, T3, T4 (README описує їхню поведінку)
- **Produces:** документація пакета за зразком `reviewer-core/CLAUDE.md`; запуск без завантаження `tsx` з реєстру.
- **Insights:** none.
- **Skill focus:** security (A03: пінований локальний `tsx` замість `npx`, який тягне `latest`); не дублювати README в CLAUDE.md (root AGENTS.md § Knowledge files: «link, don't copy»).
- **Steps:**
  1. `mcp-server/CLAUDE.md` (≤ 50 рядків, структура як у `reviewer-core/CLAUDE.md`): Before answering → README/INSIGHTS. Commands (через `node node_modules/...`). Layout (посилання на README § Структура). Hard rules: тільки HTTP API; рівно 5 інструментів; stdout лише під JSON-RPC; нове input-поле лише за рішенням користувача; `isError` з наступним кроком. Naming: файл на інструмент `src/tools/<kebab>.ts`, `register<Pascal>`, тести `test/*.test.ts`.
  2. `mcp-server/INSIGHTS.md`: шапка, як у `reviewer-core/INSIGHTS.md:1-6`, і 7 порожніх секцій (What Works, What Doesn't Work, Codebase Patterns, Tool & Library Notes, Recurring Errors & Fixes, Session Notes, Open Questions). Записів не додавати: їх пише лише skill `engineering-insights`.
  3. `.mcp.json`: `"command": "node"`, `"args": ["mcp-server/node_modules/tsx/dist/cli.mjs", "mcp-server/src/index.ts"]`. `env` і `"timeout": 240000` лишити без змін.
  4. `README.md`:
     - Секція «Підключення до Claude Code» і команди Inspector: той самий виклик через `node mcp-server/node_modules/tsx/dist/cli.mjs`, з причиною (у корені немає `package.json`, тож `npx tsx` тягне непінований пакет; на нативному Windows `npx` потребує `cmd /c`).
     - Таблиця «Інструменти»: `run_agent_on_pr` приєднується до активного прогону того ж агента; `pr` приймає і `"3"`.
     - Ліміти `get_conventions` (50 правил по ≤ 300 символів, `truncated`).
     - Секція «Тести»: перелік файлів, зокрема stdio smoke.
     - «Що свідомо НЕ робимо»: рядок про гонку двох одночасних викликів (обидва можуть стартувати, бо дедуплікує MCP, а не API).
     - П. 12 і 15 Best practices: progress/cancel тепер покриті тестами.
  5. `AGENTS.md:25`: колонку «Module rules» змінити на `mcp-server/CLAUDE.md`.
- **Acceptance criteria:**
  - [ ] `npx` не лишився в `.mcp.json`, а README і `.mcp.json` показують один і той самий спосіб запуску.
  - [ ] `mcp-server/CLAUDE.md` існує, на нього посилається `AGENTS.md`, і він не копіює README.
  - [ ] README відповідає поведінці після T2–T4 (ручна звірка з тестами).
  - [ ] Увесь набір тестів mcp-server зелений.
- **Verify:**
  - `cd mcp-server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd mcp-server && node node_modules/vitest/vitest.mjs run` → all pass (24 наявні + нові з T2/T3/T4)

### T6 [W3] [backend] Ручна перевірка: Inspector і Claude Code, цільовий сценарій
- **Status:** done
- **Files (only these):** жодних. Результати (команди, exit codes, `run_id`, verdict, counts) йдуть у звіт задачі.
- **Depends on:** T1, T5
- **Produces:** підтвердження end-to-end на живому API.
- **Insights:** `server/CLAUDE.md` Gotchas: seeded агенти використовують `openrouter / deepseek/deepseek-v4-flash`, тож потрібен `OPENROUTER_API_KEY`. `server/INSIGHTS.md` 2026-11-04: на Windows `db:migrate`/`db:seed` можуть мовчки нічого не зробити (перевіряти через `psql \dt`).
- **Steps:**
  1. Перезапустити DevDigest API (`./scripts/dev.sh --no-client` або `pnpm dev` у `server/`), щоб підхопився T1. Перевірити `GET http://localhost:3001/agents`.
  2. Inspector CLI з кореня репо:
     - `npx @modelcontextprotocol/inspector --cli node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts --method tools/list` → 5 інструментів, анотації як у README, `pr` має `type: integer`.
     - `… --method tools/call --tool-name run_agent_on_pr --tool-arg repo=lindigo-design/dev-digest --tool-arg pr=3 --tool-arg agent=Nope` → exit code 5 і текст з `list_agents`.
  3. Inspector UI (`npx @modelcontextprotocol/inspector node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts`): виклик `run_agent_on_pr` (repo `lindigo-design/dev-digest`, pr 3, agent `Security Reviewer`) → видно progress, результат `status: "done"`, без 402.
  4. Claude Code у корені репо: `/mcp` → `devdigest` connected. Промпт: «Зроби рев'ю PR №3 у репозиторії lindigo-design/dev-digest агентом Security Reviewer і скажи, чи є критичні знахідки». Модель має викликати `list_agents` → `run_agent_on_pr` (→ `get_findings`, якщо `running`), а відповідь має збігатися з `counts.critical` / `findings` з `structuredContent`.
  5. Повторний `run_agent_on_pr` одразу після старту першого (у другому вікні Inspector) → `warning` про `already running`, у DevDigest UI немає другого прогону.
- **Acceptance criteria:**
  - [ ] Inspector: 5 інструментів, `agent=Nope` дає exit 5 з підказкою.
  - [ ] Цільовий сценарій у Claude Code завершується `status: "done"` без 402, і відповідь моделі не вигадує знахідок.
  - [ ] Повторний виклик під час прогону не створює дубля.
- **Verify:** ручні кроки вище, а також `cd mcp-server && node node_modules/vitest/vitest.mjs run` → all pass.

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W1 | T1, T2, T3, T4 | in parallel (файли не перетинаються) | Verify кожної задачі + **повний** `cd mcp-server && node node_modules/vitest/vitest.mjs run` (T2 змінює harness і errors, а T3 володіє `tools.test.ts`) + typecheck mcp-server, reviewer-core, server unit |
| W2 | T5 | alone | typecheck і всі тести mcp-server |
| W3 | T6 | alone, вручну (потрібні живий API і ключ OpenRouter) | — |

Міграцій немає. `server/` не змінюється. Зміна в `reviewer-core` перевіряється server unit-тестами в T1.

## Risks · Review focus

- **T2 ламає exact-text асерти в `test/tools.test.ts` (власник T3):** 429 (`:175`), unreachable (`:184-186`), failed/402 (`:157-158`), no runs (`:273`). Gate W1 проганяє весь набір. Owner: **T2**.
- **Дедуплікація чіпляється до чужого прогону:** фільтр має бути **і** `agent_id`, **і** `status === 'running'` на тому ж PR. Гонку двох одночасних викликів не закриваємо: це документується (T5). Owner: **T2**.
- **Флейкі cancel/progress-тести і таймери, що витікають:** `sleep` має знімати listener (rap:10-17). У тестах малий `pollMs` і жодних секундних очікувань. Owner: **T2**.
- **Кап 8000 і reasoning-моделі:** приховані reasoning-токени (OpenAI reasoning через `max_completion_tokens`, `server/src/adapters/llm/openai.ts:34`; деякі апстріми OpenRouter для deepseek) рахуються в межах капу, тож відповідь може обрізатися. На OpenRouter це закриває повтор із 44621a8 (8000 → 16000, `TRUNCATION_TOKEN_CEILING`); OpenAI/Anthropic-адаптери сервера такого повтору не мають, там обрізаний JSON іде в schema repair. Для Anthropic дефолт був 4096 (`server/src/adapters/llm/anthropic.ts:17`), тепер 8000. Owner: **T1**.
- **Smoke-тест на Windows:** абсолютні шляхи, `process.execPath` замість `npx`, процес закрито в `afterAll`. Owner: **T4**. `.mcp.json` з відносними шляхами потребує cwd = корінь репо (так само, як і зараз). Owner: **T5/T6**.

## Decisions (2026-11-07, користувач)

- **Q1 → `DEFAULT_REVIEW_MAX_TOKENS = 8_000`** (переглянуто після rebase на `main`). На `main` є 44621a8: `OpenRouterProvider` повторює обрізану відповідь (`finish_reason: "length"`) з капом ×`TRUNCATION_TOKEN_FACTOR` (2), але не вище `TRUNCATION_TOKEN_CEILING = 16_000` (`reviewer-core/src/llm/openrouter.ts:28-30`, логіка `:125-126`). Кап 16 000 дорівнював би стелі, і повтор ніколи б не спрацював. Кап 8 000 резервує вдвічі менше на звичайному виклику (менше шансів на 402 на ключах з низьким лімітом), а при обрізці повтор піднімає його до 16 000. Тест і інваріант констант — у T1 (крок 3a).
- **Q2 → чекати активний прогін.** `run_agent_on_pr` не робить новий POST, якщо той самий агент уже `running` на цьому PR: чекає його й повертає findings, у `warning` пише про перевикористання. Без поля `force`.
- **Q3 → так, обидві правки.** (a) `mcp-server/` у список пакетів `.claude/skills/engineering-insights/SKILL.md`; (b) bucket `mcp-server` (`files: ["mcp-server/src/**/*.ts"]`) у `.claude/skills/pr-self-review/references/routing.json`. Implementer-агентам `.claude/**` недоступний, тому ці правки робить основна сесія разом із W2 (до T6).
- **Q4 → локальний `tsx`.** `.mcp.json`: `node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts`; один раз `cd mcp-server && npm install` (README).
