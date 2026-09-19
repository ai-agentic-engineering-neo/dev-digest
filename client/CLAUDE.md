# @devdigest/web

Next.js 15 App Router + React 19 + TanStack Query on port 3000.

## Read when

- **Finding a screen or the UI route map** → read `README.md` (has the diagram).
- **Creating or restructuring a component** → read `docs/component-conventions.md`.
- **Calling the API or adding a query/mutation** → read `docs/data-fetching.md`.
- **Starting a task in this module** → read `specs/`.
- **Debugging something that smells familiar** → read `INSIGHTS.md`; run the
  `engineering-insights` skill at the end of the task to add to it.

## Component convention (strict)

Every component is a FOLDER with a fixed set of files:

```
<Name>/
  <Name>.tsx      <Name>.test.tsx
  styles.ts       constants.ts       helpers.ts       index.ts
```

Feature components are colocated in `app/<route>/_components/`.
Shared ones live in `src/components/`. The design kit is `src/vendor/ui`
(`@devdigest/ui`), shared Zod contracts are `src/vendor/shared` (`@devdigest/shared`).

The folder's case depends on where it lives: shared folders are kebab-case
(`src/components/severity-counts/`), feature folders are PascalCase
(`app/agents/_components/AgentCard/`). The component file inside is PascalCase
either way. Full shape: `docs/component-conventions.md`.

## Rules

- Pages stay thin. All logic belongs in `_components/`.
- `fetch` inside a component is banned. Go through a hook in `src/lib/hooks/*`,
  which goes through `lib/api.ts`.
- A new endpoint means a new hook in `lib/hooks/`, not an inline call.
- User-facing text goes through `next-intl` (`messages/<locale>/*.json`),
  never hardcoded in a component.
- API errors are normalized to `ApiError` — branch on `status`, never on message text.

`pnpm lint` (eslint) enforces the `fetch` ban and hook correctness; `pnpm arch`
(dependency-cruiser, `.dependency-cruiser.cjs`) enforces the layering — shared
code may not import a route, and no route may reach into another route's
`_components/`. Both run in `client.yml`. `src/vendor/**` is excluded from both.

## Gotchas

- `src/vendor/shared` is a LAGGING copy of the contracts (see the root `CLAUDE.md`).
  It is missing `openrouter` in some enums, `AgentManifest`, and `AgentVersionConfig`.
- `src/vendor/ui` holds components for later lessons that render only inside
  `components/showcase/Showcase.tsx`, which is not reachable from any route.
  `MermaidDiagram` has no caller at all. This is staged code — do not delete it.
- Tests run under vitest + jsdom with `fetch` mocked: no API and no browser needed.
  Real browser journeys live in `../e2e`.
