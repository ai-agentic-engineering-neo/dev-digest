# client — `@devdigest/web`

The studio UI: import repos, browse pull requests, run and read AI reviews, author
agents. Next.js 15 (App Router) + React 19, data through TanStack Query hooks over
the Fastify API. `next-intl` for copy, vendored design system for components.

## Commands

`pnpm dev` (:3000) · `pnpm build` · `pnpm typecheck` · `pnpm test` (vitest + jsdom)

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) points the app at the API.

## Map

- `src/app/**/page.tsx` — routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature logic, each with its own `*.test.tsx`
- `src/components/` — cross-route chrome (`app-shell`, `diff-viewer`, …)
- `src/lib/api.ts` + `src/lib/hooks/*` — the only path to server data
- `src/vendor/ui` (`@devdigest/ui`) — design system; `src/vendor/shared` — contracts
- `messages/<locale>/*.json` — every user-visible string

## Read when

- Adding or changing a route → `README.md` § "UI route map" for the route → API pairing.
- Reaching for a UI primitive → `src/vendor/ui/README.md` (import from the
  `@devdigest/ui` barrel, never from a layer file).
- Writing a component test → `../TESTING.md` § "What each suite covers".
- A journey needs real browser coverage instead → `../e2e/AGENTS.md`.
- Changing what the API returns → `../server/AGENTS.md` (contracts live in two copies).
- Working from a spec → `specs/<feature>.md`, before the first edit.
- Something behaves inexplicably → `INSIGHTS.md` (§ What Doesn't Work, § Recurring Errors).
- You learned something non-obvious → append it to the matching `INSIGHTS.md` section.
- Touching anything that renders findings → `docs/findings-surfaces.md` first:
  four screens, three data sources.
- Working on `/skills` or the agent's Skills tab → `docs/skills-ui.md`
  (the list lives in the layout, `/skills/:id` is the pane; the tabs that exist on
  purpose; the two-step import).
- Deeper background on a surface → `docs/`.
- React, Next and Testing Library rules load on demand from `.claude/skills/` —
  not restated here.

## Conventions

- Server data flows only through `src/lib/hooks/*` → `src/lib/api.ts`. No `fetch`
  inside components, no second HTTP client.
- Pages compose; feature logic lives in the colocated `_components/<Name>/` folder
  next to its test.
- User-facing text goes into `messages/<locale>/*.json` via `next-intl` — no
  hardcoded strings in JSX.
- Component tests mock `fetch`, so they need neither the API nor a browser.

## Naming

- A component is a PascalCase folder: `_components/<Name>/<Name>.tsx` + `index.ts`,
  with `helpers.ts` / `constants.ts` / `styles.ts` beside it when they earn their file.
- Route-local UI lives in `_components/`; anything a second route renders moves to
  `src/components/<kebab-case>/` (`run-cost/`, `findings-summary/`).
- A component's test sits next to it as `<Name>.test.tsx`.
- Hooks are `use<Thing>` in `src/lib/hooks/<area>.ts`; message namespaces are the
  file name under `messages/<locale>/` and keys are camelCase dotted paths.

## Do not touch

- `pnpm-lock.yaml` — never hand-edited; add a dependency with `pnpm add` and commit
  the lockfile it writes.
- `.next/` — build output.
- `src/vendor/shared/**` in isolation: it is one of two copies of the contracts
  (the other is `server/src/vendor/shared`, which `reviewer-core` compiles against).
  Editing only this side is how the two drift apart.

## Gotchas

- The App Router renders server-first: anything reaching for a browser-only API
  needs an explicit client boundary.
- The two `@devdigest/shared` copies already differ in a few contract files, so a
  type error here can mean drift rather than a genuine mismatch.
