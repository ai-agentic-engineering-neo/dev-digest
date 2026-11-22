# reviewer-core — чисте ядро рев'ю (`@devdigest/reviewer-core`)

diff → prompt → LLM → структурований вивід → grounding gate → `Review`. Єдиний споживач у starter'і — `server`. Корінь проєкту: [../CLAUDE.md](../CLAUDE.md).

## Стек
TypeScript (ESM) · Zod · `openai` SDK (через OpenRouter) · vitest. **npm** (не pnpm).

## Команди
- `npm test` — hermetic, зі stub `LLMProvider`, без ключів і мережі.
- `npm run typecheck` — він же `build` (JS пакет не емітить).

## Карта (`src/`)
- `index.ts` — публічний API · `prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `grounding.ts` — `groundFindings` (відкидає знахідки без реальних рядків diff)
- `llm/structured.ts` (Zod → JSON Schema, parse-with-repair) · `llm/openrouter.ts`
- `review/run.ts` (оркестрація, single-pass) · `review/reduce.ts` (map-reduce) · `output/to-review.ts` (CI payload)

## Конвенції (не дефолтні)
- **Чистота:** жодних БД, GitHub, FS. Єдиний side effect — виклик LLM через **інжектований** `LLMProvider`.
- Grounding gate обов'язковий; score перераховується з тих знахідок, що вижили, а не береться від моделі.
- Недовірений вміст (diff, PR body) завжди проходить через `wrapUntrusted` — захист від prompt injection.
- Необов'язкові слоти prompt'а (`skills`, `memory`, `specs`, `callers`) у starter'і не передаються — секції просто відсутні.

## Gotchas
- Споживається як **TypeScript-вихідники** через alias `@devdigest/reviewer-core` → `../reviewer-core/src` у tsconfig сервера.
- Тестувати зі stub-провайдером; реальні виклики LLM у тестах не допускаються.

## Do-not-touch
- Не додавати імпорти БД/GitHub/FS і не обходити grounding gate.

## Далі читати
- **Перед роботою** (одразу після запиту користувача) прочитай [INSIGHTS.md](INSIGHTS.md) цього модуля. **Наприкінці** запиши лише суттєве й нове і прокоментуй (`Update YYYY-MM-DD:`) записи, на які спирався, через skill `engineering-insights` (спершу перечитай файл: дубль не пиши; нема суттєвого — нічого не пиши).
[README.md](README.md) (діаграма пайплайна) · [docs/](docs/README.md) · [specs/](specs/README.md) · [INSIGHTS.md](INSIGHTS.md)
