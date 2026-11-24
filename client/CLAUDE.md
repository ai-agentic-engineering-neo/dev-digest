# client/ — `@devdigest/web`

Next.js ^15.5 (App Router) · React ^19.3 · TanStack Query ^5 · next-intl ^3 ·
Tailwind ^4 · vitest ^2.1 + React Testing Library + jsdom · Node 22 · **pnpm 10**.

## Commands

- `pnpm dev` (:3000, needs the API on :3001) · `pnpm typecheck` · `pnpm test` · `pnpm build`

## Where things live

- `src/app/**/page.tsx` — thin pages; feature UI in colocated `_components/<Name>/`
  folders, each with its own `*.test.tsx`
- `src/lib/api.ts` — the only fetch client (`apiFetch`, `ApiError`)
- `src/lib/hooks/*` — every data hook (TanStack Query); `reviews.ts` holds `useRunEvents` (SSE)
- `src/lib/providers.tsx` — QueryClient + global error toasts
- `src/components/` — app shell, diff viewer, page shell
- `src/vendor/ui/` — design system, imported only as `@devdigest/ui`
- `src/vendor/shared/` — a COPY of `server/src/vendor/shared`
- `messages/en/*.json` — UI strings (next-intl)

## Rules

- `src/vendor/shared` is a copy, not the source of truth. Any change here is made
  in `../server/src/vendor/shared` too, in the same commit (and vice versa).
- No `fetch` outside `src/lib/api.ts`; components get data through `src/lib/hooks/*`.
- Import UI only from `@devdigest/ui`, never from a file inside `src/vendor/ui/`.
- Query errors are toasted globally in `providers.tsx`; don't add per-component
  toasts for them.
- New user-visible strings go into `messages/en/*.json`.
- A new outbound origin (API host, image host) must be added to the CSP in
  `next.config.mjs` (`connect-src` / `img-src`), or the browser blocks it.
- Review progress comes from SSE (`useRunEvents`) plus polling of `/pulls/:id/runs`;
  the `POST /pulls/:id/review` response only carries run IDs, never results.
- Tests mock `fetch`; they must not need the API, a DB or a browser.
- UI text asserted by `../e2e/specs/*.flow.json` (e.g. `#482`) is a contract — if
  you change it, update the flow.

## Read when…

- Read `README.md` (this package) when adding a route or a data hook.
- Read `src/vendor/ui/README.md` before creating a new UI component — reuse a primitive.
- Read `../docs/ONBOARDING.md` when a change needs a new or changed API endpoint or
  shared contract.
- Read `INSIGHTS.md` before debugging here; append a dated entry (Status: unverified)
  when you find non-obvious behaviour.
- Read `specs/` before implementing a UI feature that has a spec; `docs/` for
  long-form design notes.
