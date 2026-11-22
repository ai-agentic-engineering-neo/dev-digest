# INSIGHTS — проєкт

Живий журнал наскрізних знахідок: що неочевидно, що не спрацювало, що повторюється. Дописується skill'ом
`engineering-insights` (`.claude/skills/engineering-insights/`). Правила: тільки в потрібну секцію, один запис = одна
знахідка, дублі розширюємо, а не додаємо; застаріле видаляє людина під час консолідації. Остання ревізія: 2026-11-22.
Знахідки окремих модулів — у `server/`, `client/`, `reviewer-core/`, `e2e/` (`INSIGHTS.md`).

Формат запису: `- **<назва>** · YYYY-MM-DD · confirmed|suspected` і 1-3 рядки «симптом → причина → що робити» + доказ.

## What Works

- **Hermetic e2e на окремих портах** · 2026-11-22 · confirmed
  `./scripts/e2e.sh` піднімає ізольований стек (PG :5433, API :3101, web :3100) з ефемерною БД, не чіпаючи dev-БД. Це
  безпечний спосіб проганяти браузерні сценарії, поки основний стек працює. Доказ: `e2e/README.md`.

## What Doesn't Work

- **Покладатись на код виходу `pnpm db:migrate` на Windows** · 2026-11-22 · confirmed
  Команда завершується з 0, нічого не застосувавши (див. Recurring Errors & Fixes). Перевіряти результат напряму:
  `docker exec devdigest-postgres psql -U devdigest -c '\dt'`.
- **`pnpm` 12 для `./scripts/dev.sh`** · 2026-11-22 · confirmed
  Падає з `ERR_PNPM_IGNORED_BUILDS`; див. Tool & Library Notes.

## Codebase Patterns

- **`vendor/shared` — це дві фізичні копії, а не один пакет** · 2026-11-22 · confirmed
  `client/src/vendor/shared` і `server/src/vendor/shared` розійшлися: `diff -rq` показує відмінності в `adapters.ts` та
  `contracts/{eval-ci,knowledge,productionize,trace}.ts`. Зміну контракту робити в обох копіях і перевіряти сумісність.
  Update 2026-11-22: спосіб, що спрацював для `cost_usd` (`trace`, `review-api`, `platform`): один скрипт із однаковими
  заміною й перевіркою «рівно один збіг» для `server/…` і `client/…`, потім порівняння `git diff` обох копій (були ідентичні).
- **Чотири незалежні пакети без workspace** · 2026-11-22 · confirmed
  Кожен має свій lockfile; `server`/`client` — pnpm, `reviewer-core`/`e2e` — **npm**. Спільний код — через tsconfig path
  alias (`@devdigest/reviewer-core` → `../reviewer-core/src`), а не опубліковані модулі.

## Tool & Library Notes

- **pnpm 12 ламає install (`ERR_PNPM_IGNORED_BUILDS`)** · 2026-11-22 · confirmed
  pnpm 12 вважає ігноровані build-скрипти (esbuild, protobufjs, ssh2, cpu-features) помилкою; у pnpm 10 це лише
  попередження. Рішення: `npm i -g pnpm@10`. Доказ: вивід `./scripts/dev.sh`.
- **Docker-том і `down -v`** · 2026-11-22 · confirmed
  `docker compose down -v` видаляє том `devdigest_pgdata` разом з усіма репозиторіями; для «скидання» не використовувати.

- **Hooks Claude Code на Windows і частота `Stop`** · 2026-11-22 · confirmed
  Hook у `.claude/settings.json` — виконувана форма `command: "node"` + `args` (`.cmd`/`.bat` не спрацюють). `Stop` спрацьовує
  після **кожного ходу**, а не в кінці сесії, тому `insights-stop.mjs` нагадує лише раз на `session_id` і лише за наявності змін
  у коді; `SessionEnd` має тайм-аут ~1,5 с, тож для запису не годиться. Інтерактивні сесії не запускають hooks, поки
  папку не позначено довіреною. Доказ: `.claude/hooks/`, `.claude/skills/engineering-insights/references/sources.md`.

- **INSIGHTS.md захищено від перезапису hook'ом** · 2026-11-22 · confirmed
  `.claude/hooks/insights-guard.mjs` (PreToolUse) пускає лише вставки: Write мусить зберегти всі наявні рядки, `new_string`
  в Edit — містити `old_string`; руйнівні shell-команди блокуються (best effort). Свідому консолідацію дозволяє лише
  користувач файлом `.claude/hooks/ALLOW_INSIGHTS_REWRITE`. Пастка тестування: hook пропускає порожній/зламаний вхід
  (fail open), тож зламана тест-обв'язка дає хибні PASS — перевіряй, що вхід непорожній. Доказ: `references/sources.md`.

- **Макет `DevDigest Design (standalone).html` не відкрити в браузері панелі** · 2026-11-23 · confirmed
  `file://` до нього недоступний, а підняти для нього `http-server` заблокував класифікатор дозволів. Обхід: прочитати
  файл як текст — перелік артбордів дає `Grep -o` по `DCArtboard id=\"…\" label=\"…\"` (рядок ~178), назви екранів
  відповідають компонентам (`dashboard` → список PR, `pr-runs` → таймлайн, `trace-hist` → панель запуску). Вміст
  компонентів у base64, тож деталі вигляду потрібні зі скріншотів від користувача. Доказ: `specs/cost/spec.md`.
  Update 2026-11-23: спростовано в частині «потрібні скріншоти». Бандл містить `<script type="__bundler/manifest">`
  (JSON: uuid → `{mime, compressed, data}`); `data` = base64 + gzip. Розпакувавши через `zlib.gunzipSync`, отримуємо
  вихідники екранів (`screen_dashboard.jsx`, `prdetail_runs.jsx`, `screen_trace.jsx`, `primitives.jsx`) — точні колонки,
  формати й порядок елементів читаються текстом, без браузера. Роби це в тимчасовій папці, нічого не запускаючи.

- **Вихідні файли у checkout мають CRLF** · 2026-11-22 · suspected
  Файли `server/`, `client/` (код, `messages/*.json`, `vendor/shared`) з `\r\n`. Багаторядкові правки з LF-`old_string` через
  Edit-інструмент можуть не збігатися (не перевіряв прямо), тому для таких правок я користувався python-хелпером, що
  нормалізує кінці рядків і вимагає рівно один збіг. Нові файли з Write виходять LF — git це не ламає.

## Recurring Errors & Fixes

- **`db:migrate` / `db:seed` мовчки нічого не роблять на Windows** · 2026-11-22 · confirmed
  `./scripts/dev.sh` пише успіх, але в БД немає таблиць, API віддає 500 (`Failed query … from "users"`).
  Причина: CLI-блок у `server/src/db/{migrate,seed}.ts` запускається за умови
  ``import.meta.url === `file://${process.argv[1]}` ``; на Windows це `file:///D:/…` проти `file://D:\…` — не збігається.
  Правильний фікс: порівнювати через `pathToFileURL(process.argv[1]).href`.
  Обхід: разовий скрипт у `server/`, що (відносними імпортами) викликає `runMigrations`, `createDb` і `seed`; запуск
  `pnpm exec tsx <файл>`. Доказ: `server/src/db/migrate.ts`.
  Update 2026-11-22: підтверджено ще раз (міграція `0010` для `agent_runs.cost_usd`). `pnpm db:generate` на Windows працює
  нормально; застосування — лише через разовий скрипт з відносними імпортами, перевірка `\d agent_runs` у контейнері й
  `select count(*) from drizzle.__drizzle_migrations` (було 11 рядків після `0010`).

## Session Notes

### 2026-11-22
Запустили dev-digest локально (Docker Postgres + API :3001 + web :3000), провели онбординг по проєкту, створили структуру
`CLAUDE.md` + `INSIGHTS.md` + `docs/` + `specs/` у корені й чотирьох модулях та skill `engineering-insights`.
Шлях пройшов через два глухі кути: pnpm 12 і тихий `db:migrate` на Windows (обидва — вище). Не перевірено: чи нова сесія
справді підтягує `CLAUDE.md` і викликає skill.

## Open Questions

- **Уніфікувати `vendor/shared` між client і server?** · 2026-11-22 · open
  Копії вже розійшлися. Варіанти: спільний пакет або скрипт синхронізації. Наступний крок: порівняти контракти по одному й
  визначити, яка сторона новіша.
- **Виправити Windows-баг у `migrate.ts`/`seed.ts` у коді?** · 2026-11-22 · open
  Зараз лише обхід. Потрібне рішення користувача: чи правити вихідники (мінімальна зміна — `pathToFileURL`).
