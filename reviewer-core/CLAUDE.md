# reviewer-core — CLAUDE.md

## Stack

Чистий TypeScript, без БД/GitHub/FS. Єдиний side-effect — LLM-виклик через
injected `LLMProvider`. Пакетний менеджер — **npm**, не pnpm. `build` = типчек,
JS не емітиться. Деталі — [README](./README.md).

## Commands

`npm test` (vitest, хермітичні юніти зі stub `LLMProvider`) · `npm run typecheck` (== build) · `npm ci` для встановлення

## Map

- `src/prompt.ts` — `assemblePrompt()`, `wrapUntrusted()`, `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings()`, `groundingSummary()`
- `src/llm/openrouter.ts` — реалізація `LLMProvider`; `src/llm/structured.ts` —
  Zod → JSON Schema, parse-with-repair
- `src/review/run.ts` — оркестрація прогону (single-pass за замовчуванням)
- `src/index.ts` — публічний API пакета

## Non-default conventions

- Єдиний споживач у стартері — `server`, який тягне САМЕ вихідний TS через
  tsconfig alias (`@devdigest/reviewer-core` → `../reviewer-core/src`), а не
  збілджений пакет.
- Промпт приймає опційні слоти (`skills`, `memory`, `specs`, `callers`) для
  майбутніх уроків курсу — у стартері вони просто не заповнюються, не видаляти.

## Gotchas

- Забув `npm ci` тут → `server` падає при старті з `ERR_MODULE_NOT_FOUND`;
  помилка виглядає як серверна, хоча корінь — тут.
- `INJECTION_GUARD` — навмисно НЕ keyword-scan (denylist ловить лише одне
  формулювання); не "спрощувати" на regex.
- Score фінального review рахується детерміновано з findings, що вижили
  grounding gate — self-reported score моделі ігнорується.

## Do-not-touch

- Контракти `Review`/`Finding`/`Verdict` приходять з `@devdigest/shared` —
  міняти тільки синхронно з `server` і `client`.

## Докладніше

[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md)
