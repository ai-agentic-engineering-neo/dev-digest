# Аудит і hardening DevDigest — знахідки та план робіт

Дата аудиту: 2026-11-18 · гілка: `refactor/16-server-ports-inward`

## Source requirements

Формальної специфікації немає. Запит: повний аудит DevDigest на безпеку,
стабільність та інші покращення; пошук сценаріїв для перевикористання у
воркшопі; спрощення рушія запуску тестів/evals у CI (можливо, заміна на
open source). З аудиту складено план робіт за рівнями «критичний / високий /
середній».

Поза обсягом плану за рішенням автора: винесення ключа OpenRouter з рівня
workflow, pin образу LiteLLM за digest і pin GitHub Actions за SHA
(знахідка S10 нижче лишається в переліку лише як довідка).

## Як читати позначки

- **✔** — твердження перечитано в коді вручну після звіту агента.
- Без позначки — знахідка зі звіту агента, який трасував код, але не
  запускав застосунок.
- **(припущення)** — механізм реальний, але тригер або наслідок не
  підтверджено.
- Розмір: S — до пів дня, M — день-два, L — більше.

Аудит виконано лише читанням коду, `pnpm audit` та GET-запитами до GitHub
API. Жоден експлойт проти запущеного застосунку не виконувався.

---

## 1. Знахідки: безпека

| ID | Рівень | Проблема | Де |
|---|---|---|---|
| S1 | Критичний ✔ | `POST /repos` приймає `https://x.tld/github.com/../node_modules`. Регулярка не заякорена на хост і дозволяє owner `..`; сервер робить `rm -rf` сусідньої директорії (`server/node_modules`, `server/src`) і клонує туди репозиторій із сирого URL. Виконання коду через підмінений `node_modules` — припущення. Та сама причина дає blind SSRF через git і `file://` | `server/src/modules/repos/constants.ts:18`, `helpers.ts:16-23`, `server/src/adapters/git/simple-git.ts:31-63`, `server/src/vendor/shared/contracts/platform.ts:137` |
| S2 | Високий ✔ | API без автентифікації слухає `0.0.0.0` і не перевіряє `Host`/`Origin`. Сусід по LAN може перезаписати ключі, читати трейси з приватним кодом, постити коментарі й відкривати PR від імені власника токена, палити LLM-бюджет, викликати S1. Через DNS rebinding те саме доступне з браузера | `server/src/server.ts:41`, `server/src/adapters/auth/local.ts:15`, `server/src/app.ts:92` |
| S3 | Високий ✔ | Postgres опублікований на всіх інтерфейсах з обліковими даними `devdigest/devdigest` | `docker-compose.yml:9-13` |
| S4 | Високий ✔ | Markdown-рендерер вантажить зовнішні картинки з недовіреного тексту (rationale від LLM, PR-коментарі, документи репозиторію), CSP немає. Prompt injection у диф дає канал витоку контексту через URL картинки. Посилання без `target`/`rel` | `client/src/vendor/ui/primitives/Markdown.tsx`, `client/next.config.mjs` |
| S5 | Високий ✔ | Eval-пісочниця не read-only: `permissionMode: "bypassPermissions"` ігнорує `allowedTools`, тож модель під тестом має Bash і Write у чекауті з `OPENROUTER_API_KEY` в env | `evals/src/runtime/run-claude.ts:65`, `evals/src/runtime/env.ts:27` |
| S6 | Середній | Symlink, закомічений у клонований репозиторій (`.prettierrc -> ../../../.env`), читається і потрапляє в промпт та трейси. Повернення вмісту нападнику — припущення | `server/src/modules/conventions/samples.ts:30`, `modules/intent/clone.ts:7`, `modules/repo-intel/service.ts:920`, `adapters/git/simple-git.ts:123`, `adapters/codeindex/ripgrep.ts` |
| S7 | Середній | SSRF-фільтр імпорту skill з URL обходиться через `[::1]`, `[::ffff:127.0.0.1]` або DNS-ім'я на loopback; тіло відповіді повертається в preview | `server/src/modules/skills/helpers.ts:309-347`, `skills/service.ts:327-378` |
| S8 | Середній | Згенерований CI-gate запускає runner і конфіг із дерева самого PR, а зміни в `.devdigest/**` вирізаються з дифу для рев'ю. Fork-PR не зачеплені | `server/src/modules/ci/workflow.ts:122-139`, `agent-runner/src/run.ts:113` |
| S9 | Середній | Залежності з critical/high за `pnpm audit --prod`: `next` 15.5.19 (3 critical, виправлено в 15.5.28), `simple-git` 3.36.0 (2 critical, виправлено в 4.0.0), `fastify` 5.8.5, `fast-uri`, `dompurify` 3.4.8 через `mermaid`, `@modelcontextprotocol/sdk` 1.30.0, `zod` 3.25.76. Досяжність у цьому застосунку не перевірялась | `server`, `client`, `mcp-server`, `reviewer-core`, `agent-runner` |
| S10 | Середній ✔ | Ключ OpenRouter на рівні всього workflow і в образі `litellm:main-stable` без digest; жодна action не закріплена за SHA. **Поза обсягом плану** | `.github/workflows/eval-*.yml:28`, `evals/proxy/docker-compose.yml:15` |
| S11 | Середній ✔ | «Test connection» зберігає введений ключ до перевірки; одруківка затирає робочий ключ у `~/.devdigest/secrets.json` | `server/src/modules/settings/routes.ts:79-84`, `client/.../SettingsApiKeys.tsx:42-46` |

Низький рівень (у план не входить): PAT у `.git/config` клону
(`repos/helpers.ts:29-41`); LLM-кероване `evidence_path` без containment
(`conventions/service.ts:196`); git-аргументи без `--end-of-options`
(`simple-git.ts:80-110`); сирий `err.message` у 500-відповідях
(`app.ts:164-167`); `wrapUntrusted` екранує лише точний збіг
(`reviewer-core/src/prompt.ts:43-46`); немає Pino `redact`.

Перевірено і визнано справним: модель рецензента не має інструментів; вихід
валідується Zod і заземлюється цитатами; вердикт CI рахується із заземлених
знахідок; SQL параметризований; секрети не повертаються через API;
`secrets.json` має режим 0600; згенерований для користувачів workflow
використовує лише `pull_request`, має fork-guard, мінімальні `permissions` і
pin за SHA; у власних workflow немає `pull_request_target`, а fork-PR не
дістають секретів.

## 2. Знахідки: стабільність

| ID | Рівень | Проблема | Де |
|---|---|---|---|
| R1 | Високий ✔ | Будь-який невдалий фоновий job (одруківка в URL, приватний репозиторій без токена, офлайн, клон довший за 120 с) дає необроблений rejection і завершує API-процес. `tsx watch` після падіння не перезапускає | `server/src/platform/jobs.ts:59-99`; виклики в `modules/repos/service.ts:71,101,120,132`, `modules/repo-intel/routes.ts:49` |
| R2 | Високий ✔ | Міграція `0024_tidy_zaran` має `when` (14:40) раніший за `0023_flimsy_nick_fury` (18:32). База, що зупинилась на 0023, мовчки пропускає 0024; export-to-CI падає на відсутніх колонках | `server/src/db/migrations/meta/_journal.json` |
| R3 | Високий ✔ | `db:migrate` і `db:seed` нічого не роблять і виходять з кодом 0, якщо шлях до чекауту містить пробіл або не-ASCII: `import.meta.url` кодує пробіл як `%20`, `argv[1]` — ні | `server/src/db/migrate.ts:37`, `server/src/db/seed.ts:529`, `agent-runner/src/index.ts:68` |
| R4 | Високий ✔ | Cancel не зупиняє прогін: `cancelRun` викликає `runBus.cancel`, а потім `runBus.complete`, який знімає прапорець `cancelled`. LLM-виклики тривають і оплачуються, статус повертається в `done` | `server/src/modules/reviews/service.ts:128-133`, `server/src/platform/sse.ts:76-83`, `modules/reviews/repository/run.repo.ts:142-175` |
| R5 | Високий | PR, який не відкривали в UI (або seed-PR #482 з `patch: null`), рев'ювиться на порожньому дифі й завершується «0 знахідок, оцінка 100». `fetchPullHead` не має викликів у production, клони depth 1, порожній `catch {}` ховає помилку git | `server/src/modules/reviews/diff-loader.ts:18-28`, `adapters/git/simple-git.ts:66`, `modules/pulls/routes.ts:241-243` |
| R6 | Високий ✔ | Результати review не з'являються без перезавантаження, якщо користувач пішов з вкладки Findings або обірвався SSE: оновлення прив'язане до `RunStatus`, а `es.onerror` закриває стрім без перепідключення | `client/src/lib/hooks/reviews.ts:211-215`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx:214-218`, `FindingsTab/FindingsTab.tsx:106-129` |
| R7 | Високий | SSE закривається до збереження review, тож MCP-інструмент `run_agent_on_pr` може повідомити про невдачу успішного прогону. Порядок підтверджено, частота — припущення | `server/src/modules/reviews/run-executor.ts:493-521`, `mcp-server/src/tools/run-agent-on-pr.ts:141-158` |
| R8 | Середній | На старті немає перевірки застарілої схеми: сервер стартує «здоровим» із базою, що відстає на N міграцій | `server/src/app.ts:85-90` |
| R9 | Середній | `/runs/:id/events` висить вічно для прогону, якого `RunBus` не знає після рестарту; буфери ніколи не звільняються | `server/src/platform/sse.ts:37-48,90-99`, `modules/reviews/routes.ts:128-170` |
| R10 | Середній | Anthropic-адаптер: `max_tokens` 4096 обрізає великі рев'ю, а повторний запит без `tool_result` завжди дає 400. Поведінка API — зі знань, не з запуску | `server/src/adapters/llm/anthropic.ts:10,133-137` |
| R11 | Середній | 60-секундний `withTimeout` на викликах OpenAI/Anthropic не скасовує запит і не ретраїться | `server/src/adapters/llm/openai.ts:100-111`, `anthropic.ts:95-113`, `platform/resilience.ts` |
| R12 | Середній | Осиротілі jobs не прибираються після рестарту; `jobs.error` не віддається жодним маршрутом; reaped-прогони без причини | `server/src/platform/jobs.ts`, `modules/reviews/repository/run.repo.ts:105-112` |
| R13 | Середній | `GET /pulls/:id` перезаписує `pr_files`/`pr_commits` без транзакції; review, findings і завершення прогону — теж окремі записи. На весь сервер один виклик `db.transaction` | `server/src/modules/pulls/routes.ts:241-262`, `modules/reviews/run-executor.ts:496-552` |
| R14 | Середній | Немає захисту від подвійного запуску і ліміту витрат; lockfile-и та згенеровані файли йдуть у LLM; при збої частково витрачені токени не записуються. На клієнті кнопка блокується лише на час POST | `server/src/modules/reviews/service.ts:141-176`, `reviewer-core/src/review/run.ts:136-208`, `client/.../RunReviewDropdown.tsx:169` |
| R15 | Середній | `dev.sh`: немає перевірки Node ≥22 і запущеного Docker daemon; залежності ставляться лише за відсутності `node_modules`; `mcp-server` не встановлюється; `cleanup` не вбиває дерево процесів | `scripts/dev.sh:37-38,70-78,99-102` |
| R16 | Середній | Коли API недоступний: toast кожні кілька секунд без дедуплікації, polling не зупиняється, головна показує «No repositories yet» замість помилки, Retry на сторінці PR запитує `/pulls/null` | `client/src/lib/providers.tsx:35-40`, `client/src/app/_components/HomeView/HomeView.tsx:33`, `PrDetailView.tsx:155-165` |
| R17 | Середній | Дрейф `vendor/shared`: 4 файли, лише типи й коментарі. Автоматична перевірка покриває тільки eval/CI-контракти. Клієнт використовує Zod-контракти лише як типи (`as T` без `.parse`). Запис у `CLAUDE.md` про відсутній `openrouter` застарів | `client/src/vendor/shared` ↔ `server/src/vendor/shared`, `client/src/lib/api.ts:70` |
| R18 | Середній | Кожна сторінка раз на 60 с викликає `GET /repos/:id/pulls`, який синхронізується з GitHub; сторінка PR чекає на цей виклик | `client/src/lib/hooks/core.ts:102-112`, `server/src/modules/pulls/routes.ts:27-110` |

Низький рівень (у план не входить): немає м'ютекса на git-операції одного
клону; таймаут job не зупиняє handler; бракує FK-індексів; graceful shutdown
без дедлайну; 429 віддається як `internal_error`; `agent-runner` fetch без
таймауту; `e2e.sh` вбиває будь-що на :3100/:3101.

## 3. Знахідки: CI та eval-engine

| ID | Рівень | Проблема | Де |
|---|---|---|---|
| C1 | Високий | Жодна перевірка не блокує merge. За GitHub API, rulesets на `main` містять лише `update`, `deletion`, `non_fast_forward`. Коментарі «REQUIRED status check» і фраза про «blocking CI gate» у `CLAUDE.md` не відповідають дійсності | `client.yml:13-18`, `reviewer-core.yml:16-21`, `server-integration.yml:19-24`, `server-unit.yml:23-28`, кореневий `CLAUDE.md` |
| C2 | Середній ✔ | Summary eval-прогону зламаний: бектики всередині `echo "..."` виконуються як команди; значення завжди порожні, а імена файлів із PR потрапляють у shell | `eval-agents.yml:77-80`, `eval-skills.yml:77-80`, `eval-workflow.yml:76-77` |
| C3 | Середній ✔ | Model-evals не можуть зробити прогін червоним: `continue-on-error: true`, а benchmark завжди виходить з 0 | `eval-*.yml:115-119`, `evals/src/records/benchmark.ts` |
| C4 | Середній ✔ | П'ять workflow без `timeout-minutes` (стандартні 360 хв) | `client.yml`, `e2e-web.yml`, `reviewer-core.yml`, `server-integration.yml`, `server-unit.yml` |
| C5 | Середній | Без CI лишаються `agent-runner` (код, що їде в чужі репозиторії), `mcp-server`, typecheck `e2e` | `.github/workflows/` |
| C6 | Середній ✔ | Дублювання: `eval-agents.yml` і `eval-skills.yml` відрізняються 19 рядками зі 181; блок checkout → pnpm → install повторено 11 разів; 529 рядків YAML на ~200 рядків логіки | `.github/workflows/eval-*.yml` |
| C7 | Середній | Слабкі місця рушія: «baseline» означає «без skill», а не «попередня версія»; у CI `-n 2`; суддя — та сама модель, що й виконавець; skills для Claude Code міряються на Gemini Flash; покрито 2 з 18 skills і 1 з 9 агентів | `evals/src` (~2100 рядків), `skill-evals/` |
| C8 | Середній | 74 зі 100 останніх прогонів — `pull_request`/`failure` з нульовою кількістю jobs. Причина (ймовірно, approval gate для форків) — припущення, треба подивитись в UI | GitHub Actions |

### Рекомендація щодо eval-рушія

Замінити власний рушій на `claude plugin eval` для рівнів skills та агентів.
Команда є в Claude Code 2.1.326 (перевірено `--help`): baseline-плече без
плагіна, кілька прогонів, суддя, поріг із exit-кодом, ліміт вартості,
HTML-звіт. Власного vitest лишити близько 300 рядків для workflow-рівня, бо
plugin eval не вантажить проєктний `CLAUDE.md`. Запасний варіант — promptfoo
(MIT).

Відхилені альтернативи: evalite (архівований), Inspect AI та DeepEval
(Python у TypeScript-репозиторії), Langfuse/LangSmith (потребують сервера чи
акаунта), nx/turbo (потребують справжнього workspace).

Для CI-обв'язки: `dorny/paths-filter`, `actionlint`, `zizmor`.

Не перевірено і має з'ясувати spike: чи підхоплює plugin eval
`.claude/skills` на місці; чи доступний він на акаунтах студентів; вартість
прогону проти Gemini Flash.

## 4. Знахідки: сценарії для воркшопу

Обмеження, що визначають вибір:

- Записаних LLM-відповідей немає: `evals/proxy/` — LiteLLM-проксі для
  перекладу запитів, а не replay-кеш.
- Немає devcontainer / Codespaces.
- `main` не містить агентів, `evals/`, `mcp-server/`, `specs/`, `plans/`.
- `.claude/settings.json` у `.gitignore`, тож реєстрація push-hook не
  доходить до форків.
- Холодний старт повного стеку оцінено в 10–20 хвилин на учасника (оцінка
  за розміром `node_modules`, не замір).

| Сценарій | Що вчить | Сетап | Час | Ризик у залі |
|---|---|---|---|---|
| Conventions reviewer на фікстурі із закладеними порушеннями | «доказ або відкинь», пастки false positive | лише Claude Code | 20–30 хв | низький |
| Написати skill і виміряти його lift | артефакт вартий лише виміряної різниці | Node, `evals/` (352 МБ), логін Claude Code | 45–60 хв | середній |
| Архітектурний gate: `pnpm arch` + `architecture-reviewer` + pre-push hook | детермінована перевірка перед судженням LLM | залежності `server`, без Docker | 30–40 хв | низький |
| Урізаний SDD: plan → implement → verify | файли на диску як handoff, gate перед рев'ю | залежності репозиторію | 75–90 хв | високий |
| LEARNINGS.md як пам'ять агента | append-only пам'ять, що рев'ювиться | лише Claude Code | 20–25 хв | низький |
| Workflow retro та облік токенів | вимірювати оркестрацію | Claude Code + попередній прогін | 15–20 хв | середній |
| Prompt injection у PR #491 | обгортка недовірених даних і grounding gate | повний стек + ключ | 25–30 хв | середній |
| MCP-сервер, multi-agent review, pre-push CLI, export-to-CI | — | повний стек, для export ще й GitHub-токен | 15–30 хв кожен | середній–високий |

Рекомендація на 3 години: conventions reviewer як розігрів → skill і lift →
архітектурний gate з hook → урізаний SDD → retro. Усе, що потребує стеку,
показувати як демо інструктора.

Що треба підготувати (зараз не існує): гілка або тег для воркшопу; мала пара
spec/plan (найменша наявна — 430 рядків); гілка зі справжнім порушенням
архітектури в `server/src`; закомічений сніпет реєстрації hook; replay-дані
з `evals/results/`; devcontainer.

## 5. Знахідки: архітектура та реалізація

Розбір виконано читанням коду плюс `pnpm arch`, `pnpm typecheck` і
`pnpm test` у клієнті. Лічильники (`any`, `!`, `as`, i18n) — наближення за
регулярними виразами, ±10–20%. Тести бекенду не запускались.

### Загальний висновок

Стан кращий, ніж зазвичай у курсових стартерах. `strict` +
`noUncheckedIndexedAccess` у всіх пакетах; 0 `@ts-ignore`; `pnpm arch`
проходить (238 модулів, 0 нових порушень, 10 у baseline); `typecheck` чистий
у всіх пакетах; близько 995 тестів на бекенді з окремим рівнем на
справжньому Postgres і 343 на клієнті; `reviewer-core` — чистий рушій без
I/O; після SPEC-16 жоден сервіс не імпортує контейнер; на клієнті немає
god-компонентів і весь доступ до даних іде через `lib/hooks/*`.

Слабке місце спільне для обох сторін: задекларовані правила не
перевіряються там, де їх найчастіше порушують, тож студенти й агенти
копіюють те, що проходить gate.

### Бекенд

| ID | Рівень | Проблема | Докази |
|---|---|---|---|
| A1 | Високий | Архітектурний gate не перевіряє головне правило onion: «application не імпортує infrastructure». Проходять 10 імпортів модуль → конкретний адаптер і 14 файлів модулів з `node:fs`; `skills/service.ts:342` викликає `fetch()` напряму. Альтернатива `^drizzle-orm` у правилі `routes-are-adapters` мертва (шлях резолвиться в `node_modules/...`). `adapters/` і `platform/` не обмежені (`adapters/github/octokit.ts:5` → `modules/_shared`). `vendor/` виключено, що ховає цикл | `server/.dependency-cruiser.cjs`; `modules/repo-intel/service.ts:23,29`, `modules/reviews/diff-loader.ts:3`, `modules/eval/executor.ts:4` |
| A2 | Високий | Життєвий цикл прогону не має власника. Три механізми фонового виконання: `JobRunner` (лише clone та index), `void x().catch()` (reviews, eval), in-memory `inFlight` (brief, onboarding). Машина станів розмазана по шести місцях; `agent_runs.status` — nullable вільний текст; три словники статусів. `RunBus` суміщає pub/sub, буфер логу для трейсу і прапорець cancel. R4 і R7 — симптоми цього | `modules/reviews/run-executor.ts:159-178,555-579`, `repository/run.repo.ts:97,108,135`, `reviews/service.ts:139-171`, `eval/service.ts:702,999`, `platform/sse.ts`, `db/schema/runs.ts:35` |
| A3 | Високий | `pulls/routes.ts` (401 рядок) не має ні сервісу, ні репозиторію: близько 29 викликів Drizzle, запис усередині GET. Те саме в меншому масштабі в `settings`, `polling`, `workspace`. Це 4 з 10 записів baseline | `server/src/modules/pulls/routes.ts:27-275` |
| A4 | Високий | Циклічне володіння контрактами: `domain/ports/llm.ts:3` → `vendor/shared/adapters.js`, а `vendor/shared/adapters.ts:156-176` → `domain/ports/*`. Через це «чистий» `reviewer-core` і CI-bundle залежать за типами від `server/src/domain` | `reviewer-core/src/llm/openrouter.ts:2-9`, `agent-runner/src/run.ts:2` |
| A5 | Середній | Цикл structured-output (reprompt, підрахунок токенів, parse-with-repair) написано тричі; саме тому адаптери розійшлись у таймаутах і ретраях. Порт `LLMProvider` завеликий: `embed()` кидає в двох із трьох реалізацій | `adapters/llm/openai.ts:84-128`, `anthropic.ts:83-142`, `reviewer-core/src/llm/openrouter.ts:59-113` |
| A6 | Середній | У схемі 44 таблиці, 0 `pgEnum`, 0 `check()`; 21 колонка з text `enum:` лише на рівні TypeScript; `reviews.agent_id` і `reviews.run_id` без FK; 13 нетипізованих jsonb | `server/src/db/schema/` |
| A7 | Середній | `eval/service.ts` — 1515 рядків із двома майже однаковими конвеєрами прогону (агент 643-808, skill 926-1165) | `server/src/modules/eval/service.ts` |
| A8 | Середній | У жодному пакеті немає ESLint, Prettier, Biome чи knip. `no-floating-promises` сам зловив би fire-and-forget місця. 13 `.catch(() => undefined)` мовчки ковтають збої збереження, 6 із них у `run-executor.ts` | весь репозиторій |
| A9 | Середній | `JobRunner`, `RunBus` і `resilience.ts` не мають прямих тестів і не мають форми порту: `JobRunner` приймає `Db`, `RunBus` — процесний singleton, немає `Clock` (69 викликів `Date.now()`/`new Date()` у модулях) | `server/src/platform/jobs.ts`, `sse.ts`, `resilience.ts` |
| A10 | Середній | Два стилі композиції: частина сервісів — singleton-и в контейнері, частина створюється через `new` у routes; `SkillsService` має два екземпляри. На 110 handler-ах 0 `response:` схем | `server/src/platform/container.ts`, `modules/skills/routes.ts:82` |
| A11 | Середній | Ціна відсутності workspace: 7 lockfile-ів (5 pnpm, 2 npm), подвійна інсталяція в CI, дві копії контрактів (~2800 рядків кожна), скопійований і вже розбіжний diff-parser, alias оголошено тричі на споживача | `agent-runner/src/diff.ts:46-135` ↔ `server/src/adapters/git/diff-parser.ts` |

Низький рівень: застаріла документація (`docs/architecture.md` показує
`service → container → adapters` і «SSE complete» після збереження;
`server/README.md:39-40`; `server/CLAUDE.md`; заголовок
`.dependency-cruiser.cjs:8`; «20 pre-existing» у `server-unit.yml:77`);
мертвий код (`platform/model-router.ts`, `platform/prompts.ts`,
`@fastify/autoload`, три shim-и в `platform/`); `AppError` з HTTP-кодами в
`platform/`; `runOneAgent` з 11 позиційними параметрами; Stryker налаштовано
на один файл і не запускається в CI.

Справне, чіпати не треба: завантаження конфігурації, конверт помилок,
статична реєстрація модулів, ручний контейнер без DI-фреймворку, дизайн
`reviewer-core`, поділ репозиторіїв на function-файли, тонкий `mcp-server`.
Рядки Drizzle як робоча модель — прийнятно, якщо skill `onion-architecture`
перестане обіцяти чотири кільця і доменні сутності.

### Клієнт

| ID | Рівень | Проблема | Докази |
|---|---|---|---|
| F1 | Високий | Немає ESLint і перевірки меж імпортів; skill `frontend-ui-architecture` тримається лише на судженні. 13 коментарів `eslint-disable react-hooks/exhaustive-deps` нічого не роблять | `client/package.json`, `.github/workflows/client.yml` |
| F2 | Високий | Життєвий цикл live-прогону розмазаний по `PrDetailView`, `FindingsTab` (15 props), `RunStatus` і `useRunEvents` із вшитим `new EventSource`; завершення виводиться з UI-ефекту в листовому компоненті. Жодного поведінкового тесту. R6 і R14 — симптоми | `client/src/lib/hooks/reviews.ts`, `PrDetailView.tsx`, `FindingsTab.tsx`, `RunStatus.tsx` |
| F3 | Високий | Тести мокають шар, де живуть баги: 38 `vi.mock` на `@/lib/hooks*` у 25 файлах; query keys, інвалідація та шляхи помилок не виконуються. `client/CLAUDE.md` стверджує, що тести мокають `fetch` — це правда для чверті | `client/src/**/*.test.tsx` |
| F4 | Середній | Репозиторій суперечить власному skill: вкладені `_components` до трьох рівнів (7 директорій), немає `src/features`, доменний UI у `src/components`, 36 імпортів із `../../../`, `export *` barrel-и | `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard` та ін. |
| F5 | Середній | Query keys централізовані наполовину: фабрики в 8 файлах, сирі літерали в `core.ts` (13), `reviews.ts` (11), `agents.ts` (10) | `client/src/lib/hooks/` |
| F6 | Середній | Ефекти для подієвої логіки та синхронізації prop → state: ланцюжок «target + nonce» через чотири ефекти; скидання стану, що мали б бути `key={id}`; polling через `setInterval` зі stale closure | `FindingsTab.tsx:97`, `ConfigTab.tsx:29,33`, `EvalsTab.tsx:52,59`, `CiRunsView.tsx:45` |
| F7 | Середній | Доступність примітивів: `Modal` і `Drawer` без Escape, focus trap і повернення фокуса (15 споживачів); `Tabs` без ролей і стрілок (9 споживачів); клікабельні `div` без ролі | `client/src/vendor/ui/kit/Modal.tsx`, `Drawer.tsx`, `Tabs.tsx`, `FindingCard.tsx:98` |

Низький рівень: 45 файлів `vendor/ui` без `"use client"`; близько 35 рядків
тексту поза next-intl; дублікати `EvalsTab` і `New*CaseModal`.

Справне: повністю клієнтський рендеринг — узгоджений вибір для локального
інструмента без auth і SEO, RSC не потрібен; якість типів; стан через URL та
один `RepoProvider`; стилі через `styles.ts` з токенами (варто лише записати
це як конвенцію).

---

## 6. План робіт

### Етап 0 — критичний (1 PR, `server`)

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| K1 | S1 | Парсити URL через `new URL()`; вимагати `https:` і `github.com` (або строгу форму `git@github.com:`); валідувати owner за `^[A-Za-z0-9][A-Za-z0-9-]{0,38}$` і name за `^[A-Za-z0-9._-]{1,100}$`, відхиляти `.` та `..`; клонувати з відновленого `https://github.com/${owner}/${name}.git`; у `clonePathFor` перевіряти, що шлях усередині `cloneDir`, до будь-якого `rm` чи `clone` | `server/src/modules/repos/constants.ts`, `helpers.ts`, `service.ts`, `server/src/adapters/git/simple-git.ts`, `vendor/shared/contracts/platform.ts` (обидві копії) | S |

### Етап 1 — високий

**1a. Мережа (1 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| H1 | S2 | `host` за замовчуванням `127.0.0.1` з opt-in `API_HOST`; `onRequest` hook, що відхиляє чужі `Host` та `Origin` | `server/src/server.ts`, `app.ts`, `platform/config.ts`, `server/.env.example` | S |
| H2 | S3 | Прив'язати порт Postgres до `127.0.0.1`; те саме в e2e-стеку | `docker-compose.yml`, `scripts/e2e.sh` | S |

**1b. Сервер не падає і не повідомляє хибний успіх (1–2 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| H3 | R1 | `done.catch(() => {})` в `enqueue` (помилка вже записана в `jobs.error`); логуючий `process.on('unhandledRejection')` | `server/src/platform/jobs.ts`, `server.ts` | S |
| H4 | R3 | Entry guard через `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` | `server/src/db/migrate.ts`, `seed.ts`, `agent-runner/src/index.ts` | S |
| H5 | R2 | Виправити `when` для 0024 у журналі; тест на строге зростання `when`; repair-міграція з `ADD COLUMN IF NOT EXISTS` для баз, що вже пропустили 0024 | `server/src/db/migrations/meta/_journal.json`, нова міграція, новий тест | M |
| H6 | R4, R7 | Не знімати `cancelled` у `complete()` (знімати, коли executor завершився); `AND status = 'running'` в успішному update; повторна перевірка cancel перед `insertReview`; перенести `runBus.complete()` після збереження review і трейсу | `server/src/modules/reviews/service.ts`, `run-executor.ts`, `repository/run.repo.ts`, `server/src/platform/sse.ts` | M |
| H7 | R5 | Провалювати прогін із повідомленням «No diff available», коли в дифі 0 файлів; логувати проковтнуту git-помилку | `server/src/modules/reviews/diff-loader.ts`, `run-executor.ts` | S |

Застереження до H5: міграція 0024 додає `NOT NULL` колонки без default і не
ідемпотентна, а виправлення `when` не допоможе базам, які вже застосували
0025. Repair-міграцію треба перевірити на трьох станах бази: свіжа, зупинена
на 0023, пропустила 0024.

**1c. Клієнт (1 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| H8 | S4 | `disallowedElements={["img"]}` або рендер `img` як посилання; `target="_blank" rel="noopener noreferrer"` на `a`; CSP у `headers()` з `img-src 'self' data:` і `connect-src 'self' <API_BASE>` | `client/src/vendor/ui/primitives/Markdown.tsx`, `client/next.config.mjs` | S |
| H9 | R6 | Інвалідувати `reviews` і `pr-runs`, коли список активних прогонів переходить із непорожнього в порожній | `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx` | S |

**1d. Evals і CI (1 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| H10 | S5 | `permissionMode: "dontAsk"` плюс `disallowedTools: ["Bash","Write","Edit","NotebookEdit"]`; виправити коментарі про read-only | `evals/src/runtime/run-claude.ts`, `evals/src/config.ts`, `evals/README.md` | S |
| H11 | C1 | Рішення: або один агрегуючий job `ci-ok` як єдиний required check, або прибрати коментарі «REQUIRED» і фразу про blocking gate | `.github/workflows/*.yml`, `CLAUDE.md`, `TESTING.md` | S |

### Етап 2 — середній

**2a. Безпека сервера (1–2 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| M1 | S6 | Усі читання з клону через наявний `resolveContainedPath`; клон із `-c core.symlinks=false`; `lstat` в обходах | `server/src/modules/conventions/samples.ts`, `intent/clone.ts`, `repo-intel/service.ts`, `adapters/git/simple-git.ts`, `adapters/codeindex/ripgrep.ts` | M |
| M2 | S7 | Резолвити DNS і блокувати приватні, loopback, link-local та ULA адреси через `net.BlockList`, або allowlist хостів GitHub | `server/src/modules/skills/helpers.ts`, `service.ts` | S |
| M3 | S8 | Згенерований workflow бере `.devdigest/` з `pull_request.base.sha`; runner додає фіксовану блокуючу знахідку, якщо PR чіпає `.devdigest/**` або workflow; додати `timeout-minutes` і `concurrency` | `server/src/modules/ci/workflow.ts`, `agent-runner/src/run.ts` | M |
| M4 | S11 | Перевіряти ключ у пам'яті, зберігати лише після успіху; очищати поле після успіху | `server/src/modules/settings/routes.ts`, `client/.../SettingsApiKeys.tsx` | S |

**2b. Залежності (окремий PR)**

| # | Закриває | Що зробити | Розмір |
|---|---|---|---|
| M5 | S9 | `next` ≥15.5.28; `simple-git` 4.x (мажорна версія — прогнати git-адаптер); `fastify` до останньої 5.x; `@modelcontextprotocol/sdk` ≥1.30.1; `mermaid` ≥11.16.1 з override `dompurify` ≥3.4.17; `zod` до виправленої лінії; `dependency-cruiser` у devDependencies | M |

**2c. Життєвий цикл прогонів і LLM (2 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| M6 | R8 | На старті звіряти кількість рядків у `drizzle.__drizzle_migrations` із журналом і писати «Schema is N migrations behind»; віддавати те саме в `/health/ready` | `server/src/app.ts` | S |
| M7 | R9, R12 | Для невідомого `RunBus` прогону зі статусом не `running` віддавати лог із `run_traces` і закривати стрім; звільняти буфери після `complete`; reaper для jobs на старті; причина `Server restarted mid-run`; статус останнього clone-job у DTO репозиторію | `server/src/platform/sse.ts`, `jobs.ts`, `modules/reviews/routes.ts`, `repository/run.repo.ts`, `modules/repos` | M |
| M8 | R10 | Підняти `max_tokens`; слати `tool_result` з `is_error: true` у повторному запиті; явно показувати `stop_reason === 'max_tokens'` | `server/src/adapters/llm/anthropic.ts` | S |
| M9 | R11 | `timeout`/`maxRetries` через SDK-клієнти замість `withTimeout`, або `AbortController` | `server/src/adapters/llm/openai.ts`, `anthropic.ts` | S |
| M10 | R14 | Відхиляти другий прогін для пари PR+агент, поки перший `running`; пропускати lockfile-и та завеликі файли з рядком у лозі; на клієнті блокувати кнопку, поки є живий прогін | `server/src/modules/reviews/service.ts`, `reviewer-core/src/review/run.ts`, `client/.../RunReviewDropdown.tsx` | S–M |
| M11 | R13 | Транзакція на перезапис `pr_files`/`pr_commits` і на збереження review з findings та завершенням прогону | `server/src/modules/pulls/routes.ts`, `modules/reviews/run-executor.ts` | M |

**2d. Клієнт і скрипти (2 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| M12 | R16 | Дедуплікація toast-ів за повідомленням; зупинка polling при помилці; стан помилки з retry на головній; Retry на сторінці PR спершу перезапитує список; окреме «PR not found» | `client/src/lib/providers.tsx`, `lib/hooks/*`, `HomeView.tsx`, `PrDetailView.tsx` | S–M |
| M13 | R15 | Перевірка Node ≥22 і `docker info` з однорядковою підказкою; встановлення залежностей, коли lockfile новіший за `node_modules`; встановлення `mcp-server`; `kill_tree`; рання помилка, якщо :3000 чи :3001 зайняті | `scripts/dev.sh` | S |
| M14 | R17 | Тест, що порівнює `contracts/*.ts` в обох копіях без коментарів, з явним allowlist; виправити застарілі записи про `openrouter` | новий тест, `CLAUDE.md`, `client/CLAUDE.md`, `client/LEARNINGS.md` | S |
| M15 | R18 | Розділити читання і синхронізацію списку PR (явне оновлення або фоновий job) чи додати resolve-by-number; обмежити 60-секундний polling сторінкою списку | `server/src/modules/pulls/routes.ts`, `client/src/lib/hooks/core.ts` | M |

**2e. CI (2–3 PR)**

| # | Закриває | Що зробити | Файли | Розмір |
|---|---|---|---|---|
| M16 | C2, C4, C5 | Передавати значення в summary через `env:`; `timeout-minutes` у п'яти workflow; jobs для `agent-runner` і `mcp-server` | `.github/workflows/*.yml` | S |
| M17 | C6 | Один `ci.yml`: composite-action для сетапу, `dorny/paths-filter`, матриця пакетів, `ci-ok`, `actionlint` і `zizmor` | `.github/actions/setup/`, `.github/workflows/ci.yml` | M |
| M18 | C3, C7 | Spike: перенести `pr-self-review` на `claude plugin eval` і порівняти числа з поточним benchmark. За результатом — рішення про перенесення решти й видалення рушія | `evals/` | S (spike), M (перенесення) |

### Етап 3 — архітектура та реалізація

Це рефакторинг, а не виправлення дефектів, тому він іде після етапів 0–2.
Порядок важливий: спершу gate і лінтер, щоб кожен наступний крок
перевірявся автоматично.

| # | Закриває | Що зробити | Розмір | Залежить від |
|---|---|---|---|---|
| R-1 | A1, A8, F1 | Посилити gate: правила `modules-no-adapters` і `modules-no-node-io` (type-only імпорти портів дозволені), обмежити `adapters → modules` і `platform → modules` крім `container.ts`, полагодити мертву альтернативу `drizzle-orm`, внести ~25 нових порушень у baseline. Додати typescript-eslint (`no-floating-promises`, `no-misused-promises`, `consistent-type-imports`) на сервері та flat ESLint (`react-hooks`, `jsx-a11y`, `no-restricted-imports`) на клієнті; knip як warn-only | S | — |
| R-2 | низький рівень | Оновити `docs/architecture.md`, `server/README.md`, `server/CLAUDE.md`, `reviewer-core/CLAUDE.md`, заголовок cruiser-конфігу; вирішити й записати в skill-ах, що є конвенцією (рядки як модель; вкладені `_components`); видалити мертвий код | S | — |
| R-3 | A4, початок A5 | Перенести типи LLM-порту і diff-parser у `reviewer-core`; `server/domain/ports/llm.ts` реекспортує звідти; видалити застарілі shim-и та копію парсера в `agent-runner` | S | R-1 |
| R-4 | A3 | `PullsRepository` + `PullsService.syncAndList` / `getDetail`, один mapper row → DTO; те саме для `polling`, `settings`, `workspace`. Baseline зменшується з 10 приблизно до 4. Поглинає M11 (транзакція) і M15 (розділення читання та синхронізації) | M | R-1 |
| R-5 | A2, A9, A6 | `RunLifecycle` у reviews із таблицею переходів (`running → done / failed / cancelled`) і порядком «зберегти → сигналізувати»; порт `BackgroundTasks` зі `spawn(name, fn)` та `onIdle()` для тестів, спільний для reviews і eval; порти `JobStore` і `Clock`; `RunBus` на контейнер із TTL-очищенням. В тій самій зміні — міграція з CHECK-обмеженнями на статуси, `agent_runs.status NOT NULL`, FK на `reviews.run_id` / `agent_id` | M | R-3; після H6 |
| R-6 | F2, F5 | Hook `useLiveRuns(prId)` у `lib/hooks/reviews.ts`: володіє polling активних прогонів, SSE-підпискою та інвалідацією; фабрика event-source підмінюється. Фабрики `reviewKeys` / `coreKeys` / `agentKeys` | M | після H9 |
| R-7 | F3 | `renderWithProviders` (справжній QueryClient + intl) і fake на рівні `fetch`; перевести чотири view-тести (`PrDetailView`, `PullsListView`, `AgentEditor`, `SkillsView`) з моків hooks; тести для `reviews.ts` | M | R-6 |
| R-8 | F7 | Escape, focus trap і повернення фокуса в `Modal` / `Drawer`; ролі та стрілки в `Tabs`; `"use client"` на примітивах зі станом | S | — |
| R-9 | A5 | Один `runStructuredLoop(callOnce, schema, opts)` у `reviewer-core` з трьома тонкими `callOnce`; прибрати `embed` з `LLMProvider`. Поглинає M8 і M9 | S–M | R-3 |
| R-10 | A7 | Розділити `eval/service.ts` на сервіси cases / runs / read-models; параметризувати конвеєр прогону за типом власника | M | R-1 |
| R-11 | A11 | pnpm workspace з пакетом `contracts` (`workspace:*`, source exports без кроку збірки). Ризики: `transpilePackages` у Next.js, ncc-bundle, CI. Робити лише на межі когорт, бо кожен форк несе стару розкладку; дешева альтернатива — M14 | M | R-3 |

Зв'язок із попередніми етапами: H6 і H9 — швидкі точкові виправлення, R-5 і
R-6 прибирають їхню структурну причину. Якщо етап 3 стартує одразу після
етапу 1, то M8, M9, M11 і M15 варто не робити окремо, а виконати в складі
R-9 і R-4.

## 7. Порядок і залежності

1. Етап 0 і 1a–1b — до будь-якої живої сесії зі спільною мережею.
2. H6 робити одним PR разом із тестами на `RunBus` і `cancelRun`, яких зараз
   немає: зміни чіпають ті самі три файли.
3. M7 спирається на H3 і H6; M10 — на H6.
4. M17 має сенс після рішення H11; M18 — незалежний.
5. Після K1 і H3 невалідний URL репозиторію має давати 400 з повідомленням, а
   не видалення директорії чи падіння процесу — це спільний критерій
   приймання для обох.

## 8. Verification

| Модуль | Команди |
|---|---|
| server | `cd server && pnpm typecheck && pnpm test && pnpm arch`; після H5 — `pnpm db:migrate` на трьох станах бази |
| client | `cd client && pnpm typecheck && pnpm test` |
| reviewer-core, mcp-server, agent-runner | `pnpm typecheck && pnpm test` у кожному |
| evals | `cd evals && pnpm eval:quality`; після H10 — один skill-eval для перевірки, що прогін ще працює |
| e2e | `./scripts/e2e.sh` після 1a (зміна bind-адрес) і M5 (оновлення `next`) |
| CI | `actionlint` локально після M16–M17 |

Нові тести, яких вимагає план: `parseRepoUrl` і containment шляху (K1);
`JobRunner` при помилці handler (H3); зростання `when` у журналі (H5);
`cancelRun` і порядок `complete` у `RunBus` (H6); прогін на порожньому дифі
(H7); паритет `vendor/shared` (M14).

## 9. Відкриті рішення

- **H11:** робити перевірки CI обов'язковими чи позначити їх як
  рекомендаційні.
- **M18:** після spike — переносити evals на `claude plugin eval`, на
  promptfoo, чи лишити власний рушій.
- **Воркшоп:** формат (3 години практики чи 60 хвилин демо) визначає, які
  підготовчі артефакти з розділу 4 потрібні.
- **Конвенції проти коду:** для A1/F4 — привести код у відповідність до
  skill-ів чи переписати skill-и під наявний код (рядки як модель, вкладені
  `_components`).
- **R-11:** переходити на pnpm workspace на межі когорт чи лишити
  hand-synced копії з автоматичною перевіркою дрейфу.
- **Execution mode:** single-agent чи multi-agent виконання етапів — не
  вирішено.
