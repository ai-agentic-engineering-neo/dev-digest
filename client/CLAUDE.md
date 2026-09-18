# client (`@devdigest/web`) — agent notes

## Commands

```sh
pnpm dev          # next dev, :3000
pnpm build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest + jsdom, fetch mocked — no API needed
```

## Conventions

- App Router. Pages (`src/app/**/page.tsx`) stay thin; feature logic lives in
  colocated `_components/<Name>/` folders (own `*.test.tsx`, `index.ts` re-export).
- **Styling is inline `CSSProperties` objects in a colocated `styles.ts`, keyed off
  CSS variables — not Tailwind classes**, despite Tailwind 4 being installed. Never
  hard-code a colour: use `var(--accent)`, `SEV[…]`, `CAT[…]`.
- **Always import UI from the `@devdigest/ui` barrel**, never from a layer file
  underneath it.
- A new UI component must also be added to `src/components/showcase/Showcase.tsx` —
  `src/test/smoke.test.tsx` mounts that gallery, so a missing export fails CI.
- All data access goes through a hook in `src/lib/hooks/*` → `src/lib/api.ts`.
  Components never call `fetch` directly; server state is TanStack Query, not
  mirrored into `useState`.
- User-facing strings go through `next-intl` — add them to a namespace file under
  `messages/<locale>/`, never inline literals in JSX. New features add a new
  namespace file rather than editing a shared one.
- Types for API payloads come from `@devdigest/shared`. Do not redeclare them.
- `src/vendor/ui` and `src/vendor/shared` are vendored — do not touch. Change
  `vendor/shared` only as a deliberate contract change, server side first.

## Gotchas

- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`). It is read at
  build time — changing `.env` needs a dev-server restart.
- Never mix the `border` shorthand with `borderLeft` in one style object; React warns
  on rerender. See `FindingCard/styles.ts`.
- Tests mock `fetch`, so a passing test proves nothing about real API shape. The
  contract is enforced by `@devdigest/shared`, and the real journey by `../e2e`.

## Read when

- Read `insights.md` first for what was already tried here, and append to it at the
  end of the task when something non-obvious came up.
- Read `README.md` for the UI route map and which endpoints each page leans on.
- Read `src/vendor/ui/README.md` before adding or restyling a UI component.
- Read `../server/README.md` when you need the exact shape of an endpoint.
- Read `../e2e/README.md` when a change affects a seeded browser flow.
