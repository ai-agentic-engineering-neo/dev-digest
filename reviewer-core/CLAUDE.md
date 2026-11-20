# reviewer-core — чистий движок рев'ю: diff + контекст → промпт → LLM → findings → grounding. НЕ має БД, FS, мережі (крім ін'єктованого LLM).

## Stack
TypeScript 5.7 · Zod 3.24 · openai SDK 4 (для OpenRouter) · vitest 2 · **npm** (package-lock.json, не pnpm)

## Commands
- `npm run typecheck` · `npm test` · один тест: `npx vitest run <path>`
- `npm run build` = лише typecheck: server імпортує сирці напряму (../reviewer-core/src)

## Map
- src/review/run.ts — оркестрація рев'ю (`reviewPullRequest`); reduce.ts — map-reduce по файлах
- src/prompt.ts — збирання промпту + INJECTION_GUARD
- src/llm/structured.ts — structured output: Zod → JSON Schema, repair; openrouter.ts — провайдер
- src/output/to-review.ts — відбір/нормалізація findings у Review
- src/grounding.ts — grounding gate
- src/index.ts — публічний API; інтерфейс LLMProvider — у ../server/src/vendor/shared/adapters.ts

## Conventions
- Жодних імпортів БД, fs, Fastify — лише чиста логіка; LLM приходить через параметр
- Тести — зі стабом моделі, без ключів і мережі

## Gotchas
- Контракти беруться з ../server/src/vendor/shared — пакет фізично залежить від дерева server/
- Зміна тут ламає server typecheck і запускає CI server-unit — перевір обидва
- README відстає: executor також передає callers digest і rank note («high blast-radius»)
- OpenAI/Anthropic-провайдери живуть у server/src/adapters, OpenRouter — тут

## Do not touch
- INJECTION_GUARD — єдине довірене правило; keyword-фільтри не додаємо (свідоме рішення)
- Grounding gate і перерахунок score: finding без реального рядка в diff відкидається, score моделі ігнорується

## Read when
- Before changing the pipeline → read README.md ("Pipeline")
- Before changing exports → read README.md ("Public API")
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before editing anything here → read INSIGHTS.md

## Insights
Знайшов неочевидну пастку → допиши в INSIGHTS.md: `- YYYY-MM-DD · <область> · <що сталося> → <як правильно>`.
Пункт спрацював двічі → перенеси в Gotchas. (L06: перейде у хук / slash-команду.)
