# DevDigest MCP server

Локальний MCP-сервер (stdio, TypeScript), що дає Claude Code та будь-якому MCP-клієнту
доступ до DevDigest через його HTTP API: агенти-рев'юери, запуск рев'ю PR, фактичні знахідки,
конвенції репозиторію.

## Інструменти

Однакові назви аргументів в усіх інструментах: `repo`, `pr_id`, `agent_id`, `run_id`. Аргументи пласкі.

- **`repo`**: `"owner/name"`, просто `"name"` (якщо однозначне серед імпортованих) або UUID репо. Для
  `run_agent_on_pr` / `get_findings` / `get_blast_radius` **необов'язковий**: без нього PR шукається в усіх
  імпортованих репо. Кілька збігів → `isError` зі списком `owner/name#N title`.
- **`pr_id`**: `15`, `"15"`, `"#15"`, UUID PR або частина назви PR (лише при одному збігу; інакше `isError`
  зі списком кандидатів).
- **`agent_id`**: `agent_id` з `list_agents`; також працює точне ім'я агента (без урахування регістру).

| Інструмент | Що робить | Анотації |
|---|---|---|
| `list_agents` | Першим: `agents[{agent_id, name, model, role, enabled}]` (системний промпт не віддається) | `readOnlyHint: true` |
| `run_agent_on_pr` | `repo?`, `pr_id`, `agent_id`. Запускає прогін, **сам чекає** і повертає findings одного прогону. Якщо цей агент уже має активний прогін на PR, приєднується до нього (без другого платного прогону; про це каже `warning`). Disabled-агент теж запускається, з `warning` | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true` |
| `get_findings` | `repo?`, `pr_id`, опційно `run_id` / `agent_id` / `all_runs`. За замовчуванням — **останній завершений прогін кожного агента** на PR, згрупований; `agent_id` → лише цей агент; `run_id` → цей прогін; `all_runs: true` → усі завершені прогони (до 10, найновіші першими) | `readOnlyHint: true` |
| `get_conventions` | `repo`, опційно `status` (`accepted` за замовчуванням / `pending` / `all`). Кожне правило з `confidence` і доказом `path:line`; дублікати (той самий текст після нормалізації регістру/пробілів) зливаються в одне — з найвищою `confidence` і `duplicates: N`. Не більше 50 правил, `rule` ≤ 300 символів | `readOnlyHint: true` |
| `get_blast_radius` | `repo?`, `pr_id`. Карта впливу PR з індексу repo-intel (без LLM): символи змінених файлів (`name`, `file`, `kind`), прямі викликачі (`file:line`), ендпоінти/cron у файлах викликачів, і `prior_prs` — попередні PR цього репо, що чіпали ті самі файли (до 5, з `prior_prs_total`). Ліміти 30/15/10/10; `counts` серверні, до обрізки. Degraded додає `next_step`. Якщо `/prior-pulls` недоступний — `prior_prs: []` + `warning`, карта повертається. Resync ніколи не викликається | `readOnlyHint: true` |

**Finding** (усюди однаковий): `{severity, category, title, file, start_line, rationale, suggestion}`;
`title` ≤ 160, `rationale` / `suggestion` ≤ 300 символів, переноси рядків прибрані. `counts` рахуються по
всіх активних findings (dismissed не рахуються) **до** обрізки; CRITICAL ніколи не обрізаються.

Відповідь `run_agent_on_pr` (`structuredContent`):
`{status: "done"|"running", run_id, repo, pr_number, pr_id, review_id, agent_id, agent, model, created_at, cost_usd, verdict, score, summary, counts{critical,warning,suggestion}, findings[], truncated, warning?, next_step?}`.
Не більше 25 findings.

Відповідь `get_findings`:
`{status: "done"|"running", repo, pr_number, pr_id, reviews[{review_id, agent_id, agent_name, run_id, verdict, summary, score, model, created_at, cost_usd, counts, findings[], truncated}], running[{run_id, agent_id, agent_name}], counts, truncated, runs_omitted, next_step?}`.
Ліміти на всю відповідь: ≤ 25 findings на прогін і ≤ 60 разом (CRITICAL не обрізаються), ≤ 10 прогонів
(`runs_omitted` — скільки старіших не показано). `cost_usd` — з `GET /pulls/:id/runs` (`null`, якщо невідома).

Відповідь `get_blast_radius`:
`{status: "ready"|"degraded", repo, pr_number, pr_id, head_sha, indexed_sha, link_sha, reason, summary, counts{symbols,callers,endpoints,crons}, changed_symbols[{name,file,kind}], downstream[{symbol,file,kind,callers[{name,file,line}],endpoints_affected,crons_affected}], unattributed_endpoints, truncated{…}, callers_omitted_by_server, prior_prs[{number,title,author,status,shared_count,shared_files}], prior_prs_total, next_step?, warning?}`.
`link_sha` береться з сервера без змін: рядки викликачів відповідають цьому коміту. Тексти з PR і репозиторію
(findings, правила, шляхи, імена, назви PR) недовірені — це сказано в `content` і в `instructions` сервера.

### Breaking change (2026-11-08)

Аргументи перейменовано **без синонімів**: `pr` → `pr_id`, `agent` → `agent_id`. У відповідях: `pr` → `pr_number`
(+ `pr_id` як UUID), finding `line` → `start_line`, `message` → `rationale`, у `list_agents` `id` → `agent_id`.
`get_findings` без `run_id` тепер повертає **групи по агентах** (`reviews[]`), а не один прогін.
Збережені промпти чи скрипти зі старими назвами треба оновити.

Рядок для опису PR:
> **mcp-server (breaking):** args unified to `repo` / `pr_id` / `agent_id` (repo optional, PR by number/`#N`/UUID/title); findings carry `category` + `suggestion` (+ `start_line`); `get_findings` returns the latest run of every agent grouped (`all_runs`, 60/25/10 caps, `cost_usd`); `list_agents` adds `model`; `get_conventions` adds `confidence` + dedup; `get_blast_radius` adds `prior_prs`.

## Запуск

Потрібні Node ≥ 22 і запущений DevDigest API (за замовчуванням `http://localhost:3001`).
Пакет незалежний від pnpm-скриптів DevDigest: npm, власний `package.json`.

```bash
cd mcp-server && npm install         # один раз
node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts   # з кореня репо; сервер чекає JSON-RPC на stdin
```

Перевірка в MCP Inspector:

```bash
# UI
npx @modelcontextprotocol/inspector node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts
# CLI
npx @modelcontextprotocol/inspector --cli node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts --method tools/list
npx @modelcontextprotocol/inspector --cli node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts \
  --method tools/call --tool-name get_findings --tool-arg pr_id=28
```

Що перевіряти: рівно 5 інструментів, анотації як у таблиці вище, у кожного поля є опис, а помилка
(наприклад `agent_id=Nope`) приходить як `isError: true` з підказкою. Для `isError` CLI повертає код виходу 5.

Тести (vitest, in-memory MCP Client + підмінений `fetch`, без мережі):

- `test/tools.test.ts`: усі 5 інструментів, схеми, анотації, пошук `repo`/`pr_id`, групи й ліміти `get_findings`, дедуплікація `get_conventions`.
- `test/get-blast-radius.test.ts`: карта, ліміти, degraded, `prior_prs` і падіння `/prior-pulls`.
- `test/run-agent-on-pr.test.ts`: приєднання до активного прогону, progress, cancel, неоднозначний агент, `pr_id:"#3"`, помилки з наступним кроком.
- `test/stdio.smoke.test.ts`: справжній процес через `StdioClientTransport` (stdout містить лише JSON-RPC).

```bash
cd mcp-server && node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

## Підключення до Claude Code

У корені репо вже є `.mcp.json` (project scope). Claude Code попросить схвалити сервер під час
першого запуску в цій теці, а `/mcp` показує його статус.

```json
{ "mcpServers": { "devdigest": {
  "type": "stdio", "command": "node",
  "args": ["mcp-server/node_modules/tsx/dist/cli.mjs", "mcp-server/src/index.ts"],
  "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}" },
  "timeout": 240000 } } }
```

Те саме через CLI (local scope, без файлу):

```bash
claude mcp add --transport stdio devdigest --env DEVDIGEST_API_URL=http://localhost:3001 -- node mcp-server/node_modules/tsx/dist/cli.mjs mcp-server/src/index.ts
```

Чому не `npx tsx`: у корені репо немає `package.json`, тож `npx` щоразу тягне непінований `tsx` з реєстру
(supply chain, повільний холодний старт), а на нативному Windows `npx` ще й потребує обгортки `cmd /c`.
Локальний `tsx` з `mcp-server/node_modules` пінований lock-файлом. Шляхи відносні, тож cwd = корінь репо.

Цільовий сценарій: *«Зроби рев'ю PR №3 у репозиторії lindigo-design/dev-digest агентом Security Reviewer
і скажи, чи є критичні знахідки»*. Модель проходить `list_agents` → `run_agent_on_pr` → (за потреби)
`get_findings`.

## Змінні оточення

| Змінна | Дефолт | Що робить |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Базовий URL DevDigest API (`API_PORT` сервера) |
| `DEVDIGEST_RUN_TIMEOUT_MS` | `50000` | Скільки `run_agent_on_pr` чекає, рахуючи від початку виклику. Після цього повертає `status: "running"` + `run_id` + `next_step` («виклич `get_findings`»). Збільшуйте лише для клієнтів із більшим лімітом |
| `DEVDIGEST_POLL_MS` | `2000` | Інтервал опитування `GET /pulls/:id/runs` |

Секретів немає: локальний API без авторизації, ключі LLM живуть у DevDigest, а не тут.

### Таймаути

Рев'ю одним агентом часто триває довше за хвилину, а клієнти обривають виклик інструмента за власним лімітом.
Тому сервер **сам** перестає чекати раніше: `DEFAULT_RUN_TIMEOUT_MS = 50 000` мс (`src/config.ts`), рахуючи
від початку виклику (резолв repo/PR і старт прогону входять у бюджет). Після цього `run_agent_on_pr` один раз
перевіряє статус і, якщо прогін ще йде, повертає не помилку, а `status: "running"`, `run_id` і `next_step`:
«виклич `get_findings` з цим `run_id` за хвилину». Прогін у DevDigest при цьому триває.

| Клієнт | Ліміт за замовчуванням | Що робити |
|---|---|---|
| MCP Inspector v1 (звідси помилка `-32001: Maximum total timeout exceeded`) | Request Timeout (`MCP_SERVER_REQUEST_TIMEOUT`, скидається progress-повідомленнями, які ми шлемо) і **Maximum Total Timeout 60 с** (`MCP_REQUEST_MAX_TOTAL_TIMEOUT`) | 50 с вкладаються. Щоб дочекатися довгого рев'ю в одному виклику: у UI **Configuration** задайте `MCP_REQUEST_MAX_TOTAL_TIMEOUT` (мс), наприклад 300000, залиште `MCP_REQUEST_TIMEOUT_RESET_ON_PROGRESS` = true, і підніміть `DEVDIGEST_RUN_TIMEOUT_MS` нижче цього значення |
| MCP Inspector v2 | Загального ліміту немає (`MCP_REQUEST_MAX_TOTAL_TIMEOUT` прибрано); per-server `requestTimeout` у Server Settings, скидання на progress завжди увімкнене ([міграція v1→v2](https://github.com/modelcontextprotocol/inspector/blob/main/docs/v1-to-v2-migration.md)) | 50 с вкладаються; для довшого очікування — `requestTimeout` + `DEVDIGEST_RUN_TIMEOUT_MS` |
| Claude Code | `MCP_TOOL_TIMEOUT` ≈ 28 год; у `.mcp.json` стоїть `"timeout": 240000` | 50 с вкладаються; можна підняти `DEVDIGEST_RUN_TIMEOUT_MS` до ~200000 (нижче `timeout` з запасом на резолв) |

Без змін налаштувань достатньо дефолту: модель отримує `run_id` і сама дочитує результат через `get_findings`.
Помилка `MCP error -32001: Maximum total timeout exceeded` означає, що клієнтський ліміт менший за
`DEVDIGEST_RUN_TIMEOUT_MS`; зменште змінну або збільште ліміт клієнта.

## Токени на старті чату

- Рівно 5 інструментів. Описи займають 110–225 символів, схеми пласкі, enum лише один (3 значення).
  Увесь `tools/list` разом з `outputSchema` займає близько 15 KB JSON.
- **Tool search** у Claude Code увімкнений за замовчуванням. На старті сесії вантажаться лише імена
  інструментів та `instructions` сервера (у нас 3 речення про те, що це DevDigest і типовий потік),
  а схеми підтягуються на вимогу. Керування через `ENABLE_TOOL_SEARCH`: не задано або `true` — усе
  відкладено; `auto` / `auto:N` — вантажити одразу, поки описи < 10% (N%) контексту; `false` — усе одразу.
  ```bash
  ENABLE_TOOL_SEARCH=auto claude      # приклад
  ```
- Чому немає `list_repos` і `list_prs`, дивіться в розділі «Що свідомо НЕ робимо» нижче. Якщо repo
  не знайдено, текст помилки сам перелічує імпортовані репозиторії.

## Структура

```
src/index.ts         stdio-вхід (логи тільки в stderr)
src/server.ts        createServer(config, fetch?) — instructions + 5 інструментів у фіксованому порядку
src/config.ts        env → Config
src/api-client.ts    тонкий HTTP-клієнт DevDigest, Zod-схеми відповідей (ApiError / ApiShapeError / ApiUnreachableError)
src/resolve.ts       repo (owner/name | name | UUID), pr_id (номер | #N | UUID | частина назви), agent (id | назва)
src/format.ts        FindingsResult (outputSchema), стискання й обрізання findings, текстовий підсумок
src/errors.ts        ToolError, guarded() → isError: true з підказкою
src/tools/*.ts       по файлу на інструмент
test/                vitest: in-memory Client ↔ server, fake DevDigest API
```

## Best practices (ресерч, 2026-11-07)

Джерела перевірені станом на 2026-11-07: специфікація MCP 2026-07-28 (і 2025-11-25),
TypeScript SDK, стаття Anthropic «Writing effective tools for agents», документація Claude Code.

1. **Мало інструментів, орієнтованих на результат, а не «один на endpoint».** Більше інструментів не
   означає кращий результат. Краще кілька інструментів під цілісні сценарії, наприклад `schedule_event`
   замість окремих list та create.
   [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
   **У нас:** рівно 5 інструментів, а `run_agent_on_pr` сам створює прогін, чекає на нього й повертає findings.
2. **Опис пишемо як для нового колеги: коли викликати і що означають параметри.** Імена параметрів
   мають бути однозначними. Невеликі правки опису дають великий приріст точності.
   [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents)
   **У нас:** кожен опис займає 1–2 речення про те, *коли* викликати, і для кожного поля є `.describe()`
   з форматом (`"owner/name"`, номер PR).
3. **Людські ідентифікатори замість UUID.** Значущі імена зменшують галюцинації.
   [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents)
   **У нас:** `repo` — `owner/name` або просто `name` (UUID теж приймається), `pr_id` — номер / `#N` /
   частина назви, `agent_id` — id або точне ім'я. UUID DevDigest резолвимо всередині сервера; неоднозначність →
   `isError` зі списком кандидатів, а не вгадування.
4. **Пласка zod-схема з `.describe()` на кожному полі; сервер MUST валідувати вхід.** Офіційні
   приклади використовують пласкі `z.object`.
   [MCP build-server](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server.md),
   [Spec: Tools § Security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
   **У нас:** у вхідних схемах тільки `string`, `number`, `boolean` (`all_runs`) і один маленький enum, без
   вкладених об'єктів; `pr_id` — скаляр `number | string`. Формат `repo`/`pr_id` перевіряє резолвер з
   підказкою наступного кроку.
5. **`outputSchema` + `structuredContent`, і дублювання в `content`.** Якщо `outputSchema` задано,
   сервер MUST повернути відповідний `structuredContent` і SHOULD продублювати його текстом для
   сумісності. SDK валідує `structuredContent` перед відправкою.
   [Spec: Tools § Structured Content](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
   [SDK docs: tools](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md)
   **У нас:** `structuredContent = {verdict, findings[], …}`, а в `content` кладемо короткий людський
   підсумок («2 CRITICAL, 1 WARNING: …») замість дампу JSON.
6. **Стисла відповідь, обрізання з підказкою, як отримати більше.** Пагінація, фільтри й обрізання з
   розумними дефолтами. Якщо щось обрізали, скажіть агенту, як звузити запит. Режим concise витрачав
   приблизно третину токенів detailed.
   [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents)
   **У нас:** знахідка містить `severity`, `category`, `title`, `file`, `start_line`, `rationale` і `suggestion`
   (≤ 300 символів), список відсортовано за severity з лімітами 25 на прогін / 60 на відповідь і полем
   `truncated`. Промптів, трейсів і сирих DTO не віддаємо.
7. **Ліміти виводу в Claude Code.** Попередження з'являється понад 10k токенів, дефолтний ліміт 25k
   (`MAX_MCP_OUTPUT_TOKENS`), а текст понад 50k символів зберігається у файл.
   [Claude Code: MCP output limits](https://code.claude.com/docs/en/mcp)
   **У нас:** типова відповідь займає < 2k токенів, тому ліміт не чіпаємо.
8. **Протокольна помилка і `isError: true` — це різні речі.** JSON-RPC помилки призначені для невідомого
   інструмента та битого запиту. Помилки API, **валідації вводу** й бізнес-логіки повертаються як
   `isError: true` з фідбеком, за яким модель може виправитися. SDK сам перетворює невалідні аргументи
   і кинуті винятки на `isError`.
   [Spec: Tools § Error Handling](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
   [SDK docs: errors](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/errors.md)
   **У нас:** усі доменні помилки повертаємо як `isError: true`, і кожна підказує наступний крок
   («Виклич list_agents…», «Перевір номер: gh pr list -R owner/name»).
9. **Анотації — лише підказки, і вони недовірені.** `readOnlyHint` за замовчуванням `false`: інструмент
   нічого не змінює. `destructiveHint` за замовчуванням `true`: `false` означає лише адитивні зміни.
   `idempotentHint` за замовчуванням `false`: повторний виклик нічого не додає. `openWorldHint` за
   замовчуванням `true`: інструмент працює з відкритим світом зовнішніх сутностей. Останні три мають
   сенс лише при `readOnlyHint: false`. Клієнт MUST вважати анотації недовіреними.
   [schema.ts 2025-11-25 → ToolAnnotations](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-11-25/schema.ts),
   [Spec: Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
   **У нас:** 4 читальні інструменти мають `readOnlyHint: true, openWorldHint: false`, а `run_agent_on_pr`
   має `readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true`,
   бо викликає LLM-провайдера і коштує грошей.
10. **Найменші повноваження: обмеження задає API, а не MCP.** Сервер MUST контролювати доступ і
    rate limit. Клієнт SHOULD підтверджувати чутливі дії.
    [Spec: Tools § Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
    **У нас:** тільки HTTP API DevDigest без доступу до БД, тож workspace-scoping і ліміт
    `POST /pulls/:id/review` (10/хв) успадковуються автоматично. 429 перекладаємо в підказку «спробуй за N с».
11. **stdout належить JSON-RPC: логи пишемо тільки в stderr.** «Never use `console.log()`…». Секрети
    передаємо через env (`claude mcp add --env`, `${VAR}` у `.mcp.json`).
    [MCP build-server § Logging](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server.md),
    [Claude Code MCP](https://code.claude.com/docs/en/mcp)
    **У нас:** єдиний логер `console.error`. Конфігурація береться лише з env (`DEVDIGEST_API_URL`),
    секретів немає, бо локальний API без авторизації.
12. **Довгі операції: progress, cancellation, таймаути.** Якщо клієнт передав `_meta.progressToken`,
    сервер MAY слати `notifications/progress`, і `progress` MUST зростати. Під час скасування клієнт шле
    `notifications/cancelled`, і сервер SHOULD зупинитися. Обидві сторони SHOULD мати таймаут.
    [Spec: progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress.md),
    [Spec: cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation)
    **У нас:** `run_agent_on_pr` опитує `GET /pulls/:id/runs` кожні 2 с і шле progress, якщо є токен.
    Сигнал скасування перериває очікування (progress і cancel покриті тестами в `test/run-agent-on-pr.test.ts`). Власний таймаут `DEVDIGEST_RUN_TIMEOUT_MS` (дефолт 50 с від початку
    виклику): нижче за найменший типовий клієнтський ліміт (Inspector, 60 с), див. «Таймаути».
13. **Не встигли дочекатися — повертаємо handle.** Специфікація радить повертати явний handle й
    приймати його в наступних викликах.
    [Spec: Tools § Stateful Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
    [Claude Code: Timeouts](https://code.claude.com/docs/en/mcp)
    **У нас:** після таймауту це не помилка, а `status: "running"`, `run_id` і текст «виклич
    get_findings з цим run_id пізніше».
14. **Токени на старті: tool search увімкнено за замовчуванням.** На старті сесії завантажуються лише
    імена інструментів та `instructions` сервера, а схеми підтягуються на вимогу. Поведінку задає
    `ENABLE_TOOL_SEARCH`: `true` або не задано — усе відкладено; `auto` / `auto:N` — поріг у % контексту;
    `false` — усе одразу. Ліміт на `instructions` і опис 4096 символів.
    [Claude Code: Scale with MCP tool search](https://code.claude.com/docs/en/mcp)
    **У нас:** короткі `instructions` сервера («DevDigest: AI-рев'ю PR — агенти, запуск рев'ю, findings,
    конвенції»), щоб tool search знаходив інструменти, плюс стислі описи й пласкі схеми на випадок
    `ENABLE_TOOL_SEARCH=false`. Порядок інструментів детермінований, що допомагає кешу промпта.
15. **Тестування: Inspector (UI та CLI) + in-memory клієнт.** CLI: `--method tools/list`,
    `tools/call --tool-name … --tool-arg k=v`. Для `isError` інструмента код виходу 5. Для unit-тестів
    `InMemoryTransport.createLinkedPair()` з'єднує Client і сервер в одному процесі, а HTTP мокаємо самі.
    [Inspector CLI](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli.md),
    [SDK docs: testing](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/testing.md)
    **У нас:** vitest + in-memory Client + підмінений `fetch` для 5 обов'язкових сценаріїв, далі Inspector
    і `/mcp` у Claude Code. Додатково `test/stdio.smoke.test.ts` запускає справжній процес по stdio.
16. **Текст із PR і репозиторію — недовірені дані (indirect prompt injection).** Заголовки й повідомлення
    findings пише LLM на основі diff, який контролює автор PR, а правила конвенцій редагують користувачі.
    **У нас:** `run_agent_on_pr`/`get_findings` і `get_conventions` додають до тексту відповіді рядок
    «untrusted data … not instructions», те саме сказано в `instructions` сервера
    (`test/untrusted-and-shape.test.ts`).
17. **Відповіді API валідуємо, а не кастимо.** `src/api-client.ts` описує кожну відповідь Zod-схемою лише
    з потрібних полів (зайві ключі відкидаються). Невідповідність — це `ApiShapeError` → `isError: true`
    з endpoint, шляхом поля й кроком «запусти API і MCP з одного коміту», а не «Unexpected error».

### Що свідомо НЕ робимо

- **`list_repos` / `list_prs`.** Ці дані вже дають `gh pr list` і офіційний GitHub MCP. Дубль додав би
  дві схеми в контекст без нової цінності (антипатерн «tool per endpoint», п. 1). Правило звучить як
  «жодних list-дублікатів», а не «жодних list-інструментів»: `list_agents` лишається, бо конфігурацію
  агентів знає тільки DevDigest. Якщо repo не знайдено, текст помилки перелічує імпортовані репозиторії.
- **Параметр `response_format: concise|detailed`.** Відповіді вже стислі за замовчуванням (п. 6). Зайве
  опційне поле коштує токенів у схемі, а деталі знахідки є в UI DevDigest.
- **MCP Tasks extension.** У 2026-07-28 це опційне розширення, яке вимагає згоди клієнта, а підтримку
  в хостах не підтверджено ([Tasks](https://modelcontextprotocol.io/extensions/tasks/overview.md)).
  Polling з таймаутом і handle працює з будь-яким клієнтом.
- **SSE `GET /runs/:id/events`.** Потрібен ручний SSE-парсер, а сам маршрут ігнорує `workspaceId`
  (server/INSIGHTS.md, Open Questions). Polling workspace-scoped `GET /pulls/:id/runs` простіший і чесніше
  успадковує обмеження API.
- **Прямий доступ до Postgres.** Він обходив би workspace-scoping і rate limit (п. 10).
- **Сирі дампи API, трейси, системні промпти агентів** (п. 6).
- **Скасування прогону DevDigest, коли MCP-виклик скасовано.** Ми лише перестаємо чекати: прогін
  уже оплачується й допрацює, а результат можна забрати через `get_findings`.
- **Resync індексу з MCP.** Інструмент read-only, перебудову запускає людина в UI.
- **Захист від гонки двох одночасних `run_agent_on_pr`.** Дедуплікує MCP-сервер (шукає активний прогін того ж агента на PR), а не API. Якщо два виклики стартують одночасно, обидва можуть створити прогін. Це прийнятний ризик: виправлення потребує змін у `server/`.
