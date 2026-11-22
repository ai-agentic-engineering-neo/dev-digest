# client — Next.js 15 studio (`@devdigest/web`, :3000)

UI: імпорт репозиторіїв, список PR, diff, запуск і читання рев'ю, редактор агентів. Корінь проєкту: [../CLAUDE.md](../CLAUDE.md).

## Стек
Next.js 15 (App Router) · React 19 · TanStack Query · next-intl · Tailwind 4 · recharts · mermaid · react-markdown · vitest + jsdom + Testing Library. pnpm.

## Команди
- `pnpm dev` (:3000) · `pnpm build` · `pnpm start` · `pnpm typecheck`
- `pnpm test` — vitest, `fetch` замоканий, API не потрібен.

## Карта (`src/`)
- `app/` — маршрути: `repos/[repoId]/…` (PR, diff, findings), `agents/`, `settings/[section]`, `onboarding/`. Сторінки тонкі.
- `app/**/_components/<Name>/` — логіка фічі + свій `*.test.tsx`.
- `components/` — спільні: `app-shell`, `diff-viewer`, `page-shell`, `mermaid-diagram`.
- `lib/api.ts` + `lib/hooks/*` — **єдине** місце, де UI ходить в API (`NEXT_PUBLIC_API_BASE`, дефолт `http://localhost:3001`).
- `vendor/ui` (`@devdigest/ui`) · `vendor/shared` (`@devdigest/shared`) — вендорене.
- `messages/<locale>/*.json` — тексти (next-intl).

## Конвенції (не дефолтні)
- Дані тільки через хуки в `lib/hooks/*`; не робити `fetch` у компонентах.
- Видимі тексти — через next-intl, не хардкод.
- Колокація: тест лежить поруч з компонентом у `_components/<Name>/`.

## Gotchas
- `src/vendor/shared` — окрема копія контрактів, не та сама, що в `server`; зміни контракту робити в обох.
- Реальні браузерні сценарії покриває `../e2e`, а не vitest.

## Do-not-touch
- `src/vendor/ui/**` — вендорений UI-кіт.
- `src/vendor/shared/**` — лише узгоджено з `server/src/vendor/shared`.

## Далі читати
- **Перед роботою** (одразу після запиту користувача) прочитай [INSIGHTS.md](INSIGHTS.md) цього модуля. **Наприкінці** запиши лише суттєве й нове і прокоментуй (`Update YYYY-MM-DD:`) записи, на які спирався, через skill `engineering-insights` (спершу перечитай файл: дубль не пиши; нема суттєвого — нічого не пиши).
[README.md](README.md) (карта маршрутів → API) · [docs/](docs/README.md) · [specs/](specs/README.md) · [INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)
