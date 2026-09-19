# DevDigest — CLAUDE.md

Курсовий starter: local-first AI-рев'ю пул-реквестів. Репо = 4 незалежні пакети
(НЕ monorepo, без workspaces) — кожен зі своїм `package.json`, lock-файлом і
власним `CLAUDE.md`.

## Модулі

- [client/CLAUDE.md](client/CLAUDE.md) — Next.js 15 студія, `:3000`
- [server/CLAUDE.md](server/CLAUDE.md) — Fastify API + Postgres/pgvector, `:3001`
- [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) — чистий review-движок (diff → LLM → findings)
- [e2e/CLAUDE.md](e2e/CLAUDE.md) — детерміновані browser-тести (agent-browser)

## Gotchas на рівні репо

- Спільний код (`@devdigest/shared`, `@devdigest/ui`) **вендориться копіями** в
  `server/src/vendor/*` і `client/src/vendor/*`, а не через workspace-залежності —
  зміни в одній копії не підтягуються в іншу автоматично.
- `reviewer-core` ставиться через **npm** (не pnpm) і окремо від `server`/`client` —
  без цього API падає при старті з `ERR_MODULE_NOT_FOUND`.
- Міграції БД **не застосовуються автоматично** — `cd server && pnpm db:migrate`.
- Секрети — у `~/.devdigest/secrets.json`, не в `.env` і не в БД.
- Ніколи `docker compose down -v` для "скидання" — видаляє реальні дані, не лише тестові.

## Запуск

`./scripts/dev.sh` — піднімає все з нуля. Деталі — [README.md](README.md).

## Докладніше

[README.md](README.md) · [TESTING.md](TESTING.md) · [docs/agent-prompts/](docs/agent-prompts/) — читати лише за потреби задачі.
