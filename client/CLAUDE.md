# client — agent map

`@devdigest/web`: the Next.js 15 studio. Import repos, browse PRs, run reviews,
author agents. The route map and which API each screen leans on are in
README.md — read it before adding a screen.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer it —
then read code.

## Non-default conventions

- Pages are thin. Feature logic lives in colocated `_components/<Name>/`
  folders. Tests are typological, not exhaustive (`../TESTING.md`): add one where
  a behaviour is worth guarding — a folder without a `*.test.tsx` is not a defect.
- All data goes through `src/lib/hooks/*` on top of `src/lib/api.ts`. Calling
  `fetch` directly from a component bypasses `ApiError` normalization and the
  error-UX taxonomy that branches on it.
- UI primitives come from `@devdigest/ui` (`src/vendor/ui`). Do not add another
  UI library.
- Every user-facing string goes through next-intl (`messages/<locale>/*.json`,
  config in `src/i18n/request.ts`). No hardcoded strings.
- Message namespaces exist for features that are not built yet (blast, brief,
  eval, memory, skills, ...). They are placeholders for later lessons — do not
  delete them.
- Tests run under vitest + jsdom with `fetch` mocked: no API, DB or browser.

## Non-obvious behavior

- `src/vendor/shared` is a **separate copy** of the contracts. The canonical
  home is `server/src/vendor/shared`, and the two have already drifted. Change
  a contract in one place and the other is silently stale.
- `apiFetch` only sets `content-type: application/json` when a body is actually
  present. A body-less POST that declares it trips Fastify's "Body cannot be
  empty when content-type is application/json".

## Do-not-touch

- `src/vendor/ui/**` — vendored kit shared with later lessons.
- `.next/**` — build output.

## Read when

- Read `README.md` before adding a route or a screen — it maps each screen to
  the API surface it leans on.
- Read `docs/ui-architecture.md` before adding a screen or a data hook — the
  Server/Client boundary, the provider stack, the error-UX taxonomy, cache keys.
- Read `specs/pages.md` before changing a route or a query parameter — the URL
  contract (`?status=`, `?tab=`, `?trace=`, `?severity=`) is shareable state.
- Read `src/vendor/ui/README.md` before using or extending the UI primitives.
- Read `../TESTING.md` before adding or changing a test.
- Read `../server/src/vendor/shared/` — the canonical copy — whenever you change
  a contract.
- Read `INSIGHTS.md` before starting non-trivial work here.

Found a trap that cost you time? Capture it with the `engineering-insights`
skill, which appends it to `INSIGHTS.md`.
