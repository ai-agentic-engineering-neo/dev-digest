# e2e — CLAUDE.md

## Stack

Vercel **agent-browser** (Rust + CDP) — не Playwright, без LLM і без ключів.
Деталі — [README](./README.md).

## Commands

`./scripts/e2e.sh` (hermetic, рекомендовано — ізольований стек на портах
5433/3101/3100) · `npm test` (проти вже запущеного `./scripts/dev.sh`, лише якщо
dev-БД містить ТІЛЬКИ сідовані дані)

## Map

- `specs/NN-name.flow.json` — тест-флоу: список agent-browser команд, виконуються
  по черзі (це TEST-флоу, не плутати з `docs/specs/` нижче)
- `run.ts` — раннер, читає flow-файли й виконує steps проти спільної browser-сесії
- Локатори — лише детерміновані (`--url`, `--text`, `find role|text|label`);
  AI `chat`-команда НЕ використовується

## Non-default conventions

- Кожен `cmd` у flow-файлі — прямий виклик agent-browser; `wait --text`/
  `wait --url` одночасно і крок, і асерт (non-zero exit = fail).
- `{BASE}` у flow-файлах підставляється з `E2E_BASE_URL`.

## Gotchas

- Flow `02`/`04`/`05` покладаються на те, що сідоване репо `acme/payments-api` —
  ЄДИНЕ репо в БД. Проти звичайної dev-БД (де є інші імпортовані репо) вони
  падають — тому дефолт саме hermetic-раннер.
- **Ніколи `docker compose down -v`** для "скидання" — видаляє volume
  `devdigest_pgdata` з усіма реальними даними, не лише e2e.

## Do-not-touch

- Не додавати AI `chat`-команди у flow — це зламає детермінованість і
  ключ-фрі природу сюїти.

## Докладніше

[README](./README.md) · [docs/](./docs/) (тут же `docs/specs/` — специфікації
фіч, не плутати з `specs/` вище — то test-флоу) · [INSIGHTS.md](./INSIGHTS.md)
