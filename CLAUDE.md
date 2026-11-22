# DevDigest — локальний AI-рев'ю pull request'ів (starter)

Імпортуємо PR з GitHub → агент рев'юить diff → структуровані знахідки (severity + score).
Це навчальний starter: працює один наскрізний сценарій, решта фіч (M1–M8) додається поступово.

## Стек
Node ≥ 22 · pnpm ≥ 10 (**не 12** — `dev.sh` падає на ignored build scripts) · Next.js 15 / React 19 ·
Fastify 5 + Drizzle + Postgres 16 (pgvector, у Docker) · Zod · vitest.

## Карта (4 незалежні пакети, воркспейсу немає, у кожного свій lockfile)
| Папка | Що це | Порт | Менеджер |
|---|---|---|---|
| `server/` | Fastify API (`@devdigest/api`) | 3001 | pnpm |
| `client/` | Next.js UI (`@devdigest/web`) | 3000 | pnpm |
| `reviewer-core/` | чисте ядро рев'ю: diff → prompt → LLM → findings | — | npm |
| `e2e/` | браузерні тести (agent-browser, без LLM) | — | npm |

Зв'язок: `client` →(REST + SSE)→ `server` → `reviewer-core` (через tsconfig alias, як вихідники) → LLM.
Контракти — Zod у `vendor/shared` (`@devdigest/shared`).

## Команди
- Усе разом: `./scripts/dev.sh` (флаги `--no-seed` `--no-client` `--db-only`). Postgres лишається після Ctrl-C.
- Hermetic e2e: `./scripts/e2e.sh` (окремі порти, ефемерна БД).
- Тести/typecheck — у `CLAUDE.md` кожного пакета.

## Gotchas
- **Міграції не застосовуються при старті сервера.** Руками: `cd server && pnpm db:migrate`.
- **Windows:** `db:migrate` і `db:seed` мовчки нічого не роблять (перевірка `import.meta.url === file://…` не збігається), а `dev.sh` все одно пише успіх → API віддає 500. Деталі й обхід: [INSIGHTS.md](INSIGHTS.md).
- `docker compose down -v` видаляє том `devdigest_pgdata` разом з усіма репозиторіями — не робити для «скидання».
- Ключі LLM/GitHub лежать у `~/.devdigest/secrets.json` або в `.env`, ніколи не в git/БД.
- API без автентифікації, слухає тільки loopback.

## Do-not-touch
- `server/src/db/migrations/**` — тільки генерується (див. `.claude/rules/migrations.md`).
- `*/src/vendor/shared/**` — копії в `client` і `server`, уже розійшлися; правити лише узгоджено в обох.
- `server/src/vendor/**`, `client/src/vendor/ui/**` — вендорений код.

## Далі читати
- **Перед роботою** (одразу після запиту користувача) прочитай `INSIGHTS.md` модуля, якого стосується завдання (наскрізне — ще й кореневий). **Наприкінці** запиши лише суттєве й нове і прокоментуй (`Update YYYY-MM-DD:`) записи, на які спирався, — через skill `engineering-insights` (спершу перечитай файл: дубль не пиши; нема суттєвого — нічого не пиши). Це підтримують hooks у `.claude/hooks/` (підставляють INSIGHTS.md у контекст і один раз за сесію нагадують про підсумок).
- [README.md](README.md) — архітектура, quick start, roadmap · [TESTING.md](TESTING.md) — стратегія тестів
- [docs/](docs/README.md) · [specs/](specs/README.md) · [INSIGHTS.md](INSIGHTS.md)
- Пакети: [server](server/CLAUDE.md) · [client](client/CLAUDE.md) · [reviewer-core](reviewer-core/CLAUDE.md) · [e2e](e2e/CLAUDE.md)
- Skills для AI: `.claude/skills/` (каталог у `.claude/skills/README.md`)
