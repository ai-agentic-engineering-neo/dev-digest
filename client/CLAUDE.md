# client — `@devdigest/web`

## Map

| Path | What |
|------|------|
| `src/app/**/page.tsx` | App Router pages — thin; feature logic lives in colocated `_components/<Name>/` |
| `src/components/` | cross-page components (app-shell, diff-viewer, page-shell, mermaid-diagram, …) |
| `src/lib/api.ts` | `apiFetch` + `ApiError` — the only HTTP client |
| `src/lib/hooks/` | TanStack Query hooks per domain (`core`, `agents`, `reviews`, `repo-intel`, `trace`) |
| `src/lib/` | providers, repo context, theme, toast, shared types |
| `src/vendor/ui/` | `@devdigest/ui` design system |
| `src/vendor/shared/` | copy of `@devdigest/shared` contracts |
| `messages/<locale>/*.json`, `src/i18n/` | next-intl messages and config |

## Stack (client-only)

Next.js 15.5 (App Router) · React 19 · TanStack Query 5 · Tailwind 4 · next-intl 3 · recharts · mermaid · react-markdown · vitest + jsdom + React Testing Library.

## Conventions

- A component is a folder: `Name.tsx`, `index.ts`, and as needed `constants.ts`, `helpers.ts`, `styles.ts`, `Name.test.tsx`. Nested children go in its own `_components/`.
- `styles.ts` exports an object `s` of `CSSProperties` built on CSS variables (`var(--bg-elevated)`, …).
- Import UI from the `@devdigest/ui` barrel only.
- Fetch data through hooks in `src/lib/hooks/*`, which wrap `apiFetch`.
- User-facing strings go in `messages/<locale>/*.json`.

## Gotchas

- `src/vendor/shared` has drifted from `server/src/vendor/shared` (the source of truth). Sync the touched contract file before relying on it.
- `apiFetch` sets `content-type: application/json` only when a body is sent — Fastify rejects an empty JSON body on body-less POST/PUT.
- The API's CORS allows only the origin derived from `WEB_PORT` in `server/.env`; running the client on another port needs that value changed.

## Pointers

- Read when you need the route map or which endpoints a page calls: [README.md](README.md)
- Read when adding or changing a design-system component: [src/vendor/ui/README.md](src/vendor/ui/README.md)
- Read when writing or running tests: [../TESTING.md](../TESTING.md)
- Read when you need design notes or how-tos for this module: [docs/](docs/)
- Read when implementing or changing a feature here: [specs/](specs/)
- Read when starting non-trivial work here; append when you find something non-obvious: [INSIGHTS.md](INSIGHTS.md)
