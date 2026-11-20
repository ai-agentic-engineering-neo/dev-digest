# client — `@devdigest/web`

Next.js 15.5 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · recharts ·
mermaid · react-markdown · vitest 2 + Testing Library + jsdom. Tailwind 4 is installed,
but components are styled with inline style objects + CSS variables (see below).

## Commands (pnpm)
```sh
pnpm dev         # :3000; talks to the API at NEXT_PUBLIC_API_BASE (default :3001)
pnpm typecheck
pnpm test        # vitest; fetch is mocked, no API needed
pnpm build
```

## Map
```
src/app/**/page.tsx         thin routes; feature UI lives in colocated _components/<Name>/
src/lib/api.ts              apiFetch + ApiError — the only fetch path
src/lib/hooks/*.ts          every TanStack Query hook, one file per domain
src/components/             cross-route chrome (app-shell, diff-viewer, page-shell…)
src/vendor/ui/              design system, imported as @devdigest/ui
src/vendor/shared/          COPY of server/src/vendor/shared (Zod contracts)
messages/en/<ns>.json       next-intl strings, one file per namespace
```

## Conventions (non-default)
- Component folder: `_components/<Name>/{Name.tsx, Name.test.tsx, index.ts, styles.ts,
  constants.ts, helpers.ts}`. `index.ts` re-exports the named component and a default export.
- Styles: `export const s = { … }` of `CSSProperties` in `styles.ts`, using `var(--…)`
  tokens from `@devdigest/ui/styles.css`. Don't add Tailwind classes.
- UI components are imported only from the `@devdigest/ui` barrel, never from a layer file.
- Data: component → hook in `lib/hooks` → `apiFetch`. No raw `fetch` in components.
- User-facing text goes through `useTranslations(ns)`; add the keys to `messages/en/<ns>.json`.
- Tests are colocated next to the component (`*.test.tsx`).

## Gotchas
- `src/vendor/shared` has drifted from the server copy (e.g. `LLMProvider.id` lacks
  `'openrouter'`). Contract change → edit both copies; the server copy is canonical.
- Path aliases are declared twice — `tsconfig.json` AND `vitest.config.ts`. Keep them in sync.
- `vendor/ui` contains components for later milestones (e.g. `ExportWizardSteps`) that
  are used only by `components/showcase`.
- A run's live log streams over SSE (`/runs/:id/events`, see `lib/hooks/reviews.ts`), not polling.
- UI text is asserted by e2e flows (`../e2e/specs`) — grep them before renaming visible strings.

## Do not touch
- `src/vendor/shared` — never edit one copy only.
- `.next/` — build output.

## Read when
- You add a page or call a new endpoint → `README.md` (UI route map).
- You build or reuse a UI component, tokens, or theming → `src/vendor/ui/README.md`.
- You write component tests → `../TESTING.md`.
- You need an API contract → `../server/README.md` (API map).
- You start a feature → write the spec in `specs/` first; design notes → `docs/`.
- Before a non-trivial change → `INSIGHTS.md`; append what you learn.
