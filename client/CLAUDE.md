# client — CLAUDE.md

## Stack

Next.js 15 (App Router), React 19, TanStack Query, next-intl, recharts, mermaid,
react-markdown. Деталі — [README](./README.md).

## Commands

`pnpm dev` (`:3000`) · `pnpm build` · `pnpm test` (vitest + jsdom, `fetch` mocked) · `pnpm typecheck`

## Map

- `src/app/**/page.tsx` — роути (App Router)
- `src/lib/hooks/*` → `src/lib/api.ts` — усі звернення до API
- `src/components/app-shell` — навігація, breadcrumbs, `g`-шорткати
- `src/vendor/shared`, `src/vendor/ui` — вендорені (скопійовані, не npm-залежність)
  `@devdigest/shared` і `@devdigest/ui`
- Фіча-логіка — у колокованих `_components/<Name>/`, кожен з власним `*.test.tsx`

## Non-default conventions

- Дані виключно через TanStack Query hooks у `src/lib/hooks/*`, не `fetch` напряму
  в компонентах.
- `src/vendor/shared`/`src/vendor/ui` — копії з `server`; синхронізація ручна, не
  єдине джерело.

## Gotchas

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) — якщо API на іншому
  порту, дев/тести ламаються мовчки, без явної помилки.
- Реальні browser-флоу перевіряються не тут, а в [`../e2e`](../e2e/CLAUDE.md).

## Do-not-touch

- `src/vendor/shared`, `src/vendor/ui` — не редагувати вручну; питати перед зміною
  механізму вендорингу.

## Докладніше

[README](./README.md) · [docs/](./docs/) · [specs/](./specs/) · [INSIGHTS.md](./INSIGHTS.md)
