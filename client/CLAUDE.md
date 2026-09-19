# client — @devdigest/web (Next.js 15 App Router + React 19)

## Commands (pnpm)
pnpm dev (:3000) · pnpm test (vitest + jsdom, fetch mocked) · pnpm typecheck · pnpm build
API base: NEXT_PUBLIC_API_BASE (default http://localhost:3001)

## Layout
src/app/**/page.tsx               thin route pages
src/app/**/_components/<Name>/    Name.tsx · index.ts · styles.ts · constants.ts · helpers.ts · Name.test.tsx
src/components/                   cross-route components (app-shell, diff-viewer, …)
src/lib/api.ts                    apiFetch + ApiError — the only place that calls fetch
src/lib/hooks/<domain>.ts         all TanStack Query hooks (agents, core, reviews, trace, repo-intel)
src/vendor/ui/                    @devdigest/ui — primitives, kit, charts, shell
src/vendor/shared/                COPY of server/src/vendor/shared
messages/en/<ns>.json             next-intl strings, one namespace per feature

## Rules
- Data access only via a hook in lib/hooks → api.ts; components never call fetch.
- After a mutation, invalidate the matching queryKey (follow existing hooks).
- Live run logs come from SSE via useRunEvents (lib/hooks/reviews.ts) — don't poll for them.
- Styling: typed CSSProperties objects in styles.ts using CSS vars (var(--bg-elevated), …);
  className only for global helpers from globals.css (mono, tnum).
- User-facing text → messages/en/*.json via useTranslations, not hardcoded strings.
- New feature component = the _components/<Name>/ folder shape, with its own test.
- Tests: React Testing Library (render/screen/fireEvent) with fetch mocked; no real API.

## Do not touch
- src/vendor/shared/** — only sync from server/src/vendor/shared, never diverge by hand.
- src/vendor/ui/** — shared kit; extend it, don't fork components per page.

## Read when
- Route map / which page calls which endpoint → README.md
- Designing UI for a feature → specs/ · background notes → docs/
- Before a non-trivial change → skim INSIGHTS.md
