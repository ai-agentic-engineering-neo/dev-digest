# client (@devdigest/web)

Next.js 15 App Router studio on port 3000. Stack: TypeScript (no `"type"` field), Node >= 22, React 19, TanStack Query 5, next-intl 3, Tailwind 4, Vitest + Testing Library (jsdom).

## Commands
- `pnpm install`
- `pnpm dev` (next dev, :3000), `pnpm build`, `pnpm start`

## Verify
- `pnpm typecheck`
- `pnpm test` (vitest + jsdom, no API needed)
- No linter or formatter is configured; do not add a lint command.

## Naming conventions
- Components are `_components/<Name>/`: PascalCase folder, `<Name>.tsx`, `index.ts`, colocated `<Name>.test.tsx`.
- Shared containers are kebab-case (`src/components/app-shell`); route params like `[repoId]`; hooks are `useXxx.ts`.
- TanStack Query hooks are kebab files per area in `src/lib/hooks/`; i18n catalogs are `messages/en/<feature>.json`.

## Hard rules and gotchas
- User-visible strings go through next-intl: `messages/en/*.json`, merged by `src/i18n/request.ts` (single locale).
- Data hooks in `src/lib/hooks/*` call the API through `src/lib/api.ts` (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`).
- Pages are thin; feature logic sits in colocated `_components/<Name>/` folders, each with its own `*.test.tsx`.
- `src/vendor/` (`shared`, `ui`) is vendored (`@devdigest/shared`, `@devdigest/ui`); its `shared` copy differs from `server/src/vendor/shared`; no sync script, do not edit it here.

## Read when
- Read [README](README.md) when you need the UI route map.
- Read [docs](docs/README.md) when you need how-it-works detail.
- Read [specs](specs/README.md) when starting a lesson or feature.
- Read [INSIGHTS](INSIGHTS.md) before changing a route, hook or i18n area it lists.
- Read [TESTING](../TESTING.md) when adding component tests.
- Read the [root README](../README.md) when setting up the whole project.

## Folder map
- `src/app/`: App Router routes
- `src/components/`: reusable UI shared across routes
- `src/i18n/`: next-intl request config
- `src/lib/`: API client, providers, theme, helpers; `hooks/` holds Query hooks
- `src/test/`: Vitest setup
- `messages/`: translation catalogs (only `en`)
