# client — Next.js UI :3000 (студія DevDigest). НЕ ходить у БД чи LLM — лише REST/SSE до server :3001.

## Stack
Next.js 15.5 (App Router) · React 19 · TanStack Query · next-intl 3 · Zod 3.25 · recharts · mermaid · vitest 2 + jsdom + RTL · pnpm

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` · один тест: `pnpm vitest run <path>`
- Тести мокають fetch — API не потрібен

## Map
- src/app/** — сторінки (тонкі), маршрути див. README.md
- src/app/**/_components/<Name>/ — фіча-логіка + тест поруч
- src/components/ — спільні компоненти між сторінками (app-shell, diff-viewer, …)
- src/lib/api.ts — fetch до API (`NEXT_PUBLIC_API_BASE`)
- src/lib/hooks/* — УСІ дані: TanStack Query + EventSource для /runs/:id/events
- src/vendor/ui — UI-примітиви (@devdigest/ui); src/vendor/shared — Zod-контракти
- messages/<locale>/*.json — рядки UI

## Conventions
- Сторінка лише компонує; логіка — у колокованих `_components/<Name>/`
- Дані — тільки через хук із lib/hooks; прямий fetch у компоненті заборонений
- Жодного захардкодженого тексту в UI — ключ у messages/ + next-intl
- Примітиви беремо з src/vendor/ui, не тягнемо нову UI-бібліотеку

## Gotchas
- vendor/shared тут відстає від server: LLMProvider.id без `openrouter`, нема `commitFiles`, `sync`, `diffNameOnly`, `sessionId`
- Браузерні сценарії перевіряє ../e2e, не vitest тут

## Do not touch
- src/vendor/** — вендорні копії; правки лише разом із синхронізацією (див. кореневий CLAUDE.md)

## Read when
- Before adding or moving a page → read README.md ("UI route map")
- Before using or adding a UI primitive → read src/vendor/ui/README.md
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before editing anything here → read INSIGHTS.md

## Insights
Знайшов неочевидну пастку → допиши в INSIGHTS.md: `- YYYY-MM-DD · <область> · <що сталося> → <як правильно>`.
Пункт спрацював двічі → перенеси в Gotchas. (L06: перейде у хук / slash-команду.)
