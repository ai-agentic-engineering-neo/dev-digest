# e2e — детерміновані браузерні флоу для client через agent-browser (CDP). Без Playwright, без LLM, без ключів.

## Stack
agent-browser CLI · tsx · TypeScript 5.7 · **npm** (package-lock.json, не pnpm)

## Commands
- Рекомендовано (ізольований стек на :5433/:3101/:3100): `../scripts/e2e.sh` або `npm run e2e:hermetic`
- Проти свого стеку: `../scripts/dev.sh`, потім `npm test` — лише якщо в БД тільки seeded-репо
- `npm run typecheck`
- Разово: `npm i -g agent-browser && agent-browser install`

## Map
- specs/NN-name.flow.json — флоу: список команд agent-browser (це і є тести)
- run.ts — раннер: виконує флоу в одній сесії браузера; lib/assert.ts — перевірки
- test-results/ — скріншоти падінь (git-ignored, артефакт CI)

## Conventions
- Новий флоу = новий specs/NN-name.flow.json із наступним номером; кожен крок має `label`
- Асерти — це `wait --text` / `wait --url` (+ опційно `assert.stdoutIncludes`)
- Локатори лише детерміновані: `--url`, `--text`, `find role|text|label`. Команду `chat` не використовуємо ніколи
- Флоу читають тільки seeded-дані (acme/payments-api, PR #482, seeded agents) і нічого не сабмітять

## Gotchas
- Флоу 02/04/05 падають на dev-БД з іншими репо: редірект веде на ПЕРШЕ репо
- `{BASE}` підставляється з E2E_BASE_URL (за замовчуванням http://localhost:3000)

## Read when
- Before adding or changing a flow → read README.md ("How a flow works", "Coverage")
- Before changing ports/env or the runner → read README.md ("Run locally")
- Before changing CI wiring → read ../TESTING.md
- Before editing anything here → read INSIGHTS.md

## Insights
Знайшов неочевидну пастку → допиши в INSIGHTS.md: `- YYYY-MM-DD · <область> · <що сталося> → <як правильно>`.
Пункт спрацював двічі → перенеси в Gotchas. (L06: перейде у хук / slash-команду.)
