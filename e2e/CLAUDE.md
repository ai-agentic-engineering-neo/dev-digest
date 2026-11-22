# e2e — браузерні тести (`@devdigest/e2e`)

Детерміновані UI-сценарії поверх **agent-browser** (CLI + CDP). Без Playwright, без LLM, без ключів. Корінь проєкту: [../CLAUDE.md](../CLAUDE.md).

## Стек
agent-browser CLI · `tsx run.ts` · TypeScript. **npm** (не pnpm).

## Команди
- Встановити один раз: `npm i -g agent-browser && agent-browser install`
- **Hermetic (рекомендовано):** `../scripts/e2e.sh` — ізольований стек на інших портах (PG :5433, API :3101, web :3100), ефемерна БД, сам прибирає за собою.
- Проти свого стеку: `npm test` (див. попередження нижче).

## Карта
- `specs/NN-name.flow.json` — **виконувані** сценарії: список команд agent-browser, `run.ts` читає лише `*.flow.json`.
- `run.ts` — раннер · `lib/` — допоміжне · `agent-browser.json` — конфіг.

## Конвенції (не дефолтні)
- Асерти — це `wait --text` / `wait --url` (падають за таймаутом). Локатори тільки детерміновані; AI-команду `chat` не використовувати.
- Сценарії працюють з read-only seed-даними (`acme/payments-api`, PR #482), тож жодних викликів моделі.

## Gotchas
- **Потрібна свіжа seed-БД.** Сценарії 02/04/05 ідуть на *перший* репозиторій. На dev-БД з іншими репо вони падають → використовувати hermetic.
- **Не робити `docker compose down -v`** для скидання dev-БД (видаляє том з усіма даними).
- Папка `specs/` тут — це **виконувані flow-файли**, а не специфікації фіч (на відміну від інших пакетів). Не класти туди `*.flow.json`, які не мають запускатися.

## Do-not-touch
- Не змінювати seed-дані й не додавати кроки, що викликають LLM.

## Далі читати
- **Перед роботою** (одразу після запиту користувача) прочитай [INSIGHTS.md](INSIGHTS.md) цього модуля. **Наприкінці** запиши лише суттєве й нове і прокоментуй (`Update YYYY-MM-DD:`) записи, на які спирався, через skill `engineering-insights` (спершу перечитай файл: дубль не пиши; нема суттєвого — нічого не пиши).
[README.md](README.md) · [docs/](docs/README.md) · [specs/README.md](specs/README.md) · [INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)
