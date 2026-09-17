# CLAUDE.md — `@devdigest/web`

The studio UI: import repos, browse PRs, run and read AI reviews, author agents. Next.js App Router over the Fastify API — the API is the only backend contract; this package never imports server code.

Package overview → [README.md](README.md) · internals → [docs/architecture.md](docs/architecture.md) · route contract → [specs/ui-flows.md](specs/ui-flows.md) · design system → [src/vendor/ui/README.md](src/vendor/ui/README.md) · hard-won findings → [INSIGHTS.md](INSIGHTS.md)

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query · next-intl · Tailwind v4 (PostCSS) · recharts · mermaid · react-markdown · Zod contracts · vitest + jsdom + Testing Library.

## Commands

```sh
pnpm dev        # :3000
pnpm build
pnpm test       # vitest + jsdom, fetch mocked — no API, no browser needed
pnpm typecheck
```

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) points at the API.

## Where things live

| Path | What |
|------|------|
| `src/app/<route>/page.tsx` | routes; pages stay thin |
| `src/app/<route>/_components/<Name>/` | feature components, colocated with the route that uses them |
| `src/components/` | cross-route components (app shell, diff viewer, page shell, mermaid) |
| `src/lib/api.ts` | the only `fetch` wrapper; normalizes errors to `ApiError` |
| `src/lib/hooks/` | every TanStack Query hook, split by domain (`core`, `agents`, `reviews`, `trace`, `repo-intel`) |
| `src/lib/` | providers, theme, toast, repo context, types, formatting helpers |
| `src/vendor/ui/` | `@devdigest/ui` design system (tokens → primitives → kit → charts → shell) |
| `src/vendor/shared/` | `@devdigest/shared` Zod contracts (vendored) |
| `messages/en/*.json` | next-intl namespaces, one per feature area |

## Non-default conventions

- **Colocation over shared folders.** A feature component is a folder with `Name.tsx` + `index.ts` and, as needed, `constants.ts`, `helpers.ts`, `styles.ts`, `Name.test.tsx`. Import it via its `index.ts`.
- **Always import UI from the `@devdigest/ui` barrel**, never from a layer file inside `src/vendor/ui`.
- **All network access goes through `src/lib/api.ts`**, wrapped in a hook under `src/lib/hooks/`. No bare `fetch` in a component.
- Errors branch on `ApiError.status` / `code` to pick the UX: toast, inline, or full-screen. `code: "network_error"` (status 0) means the API is unreachable.
- Server state lives in TanStack Query, not in React state. In-flight runs are **server-sourced** (`/pulls/:id/runs/active`), so they survive reload and navigation.
- Tab/drawer state lives in the URL query (`?tab=`, `?trace=`), not in component state.
- User-visible strings go in `messages/en/<namespace>.json`.

## Gotchas

- Routes are keyed by **PR number**, but every PR API is keyed by the row **uuid** — resolve number → id through the cached pulls list before fetching detail.
- Most of this surface is `"use client"`; adding a server component means checking that hooks and context providers still resolve.
- Run progress arrives over SSE from `/runs/:id/events`, but the authoritative status comes from polling the runs endpoints — keep both in sync when changing run UI.
- Tests mock `fetch`; a component that fetches outside `api.ts` will escape the mock and hang.
- Only `NEXT_PUBLIC_`-prefixed env vars reach the browser.
- `messages/en/` already contains namespaces for features later lessons add — an unused namespace is not dead code.

## Do not touch

- `src/vendor/ui/**` — vendored design system. Add a component through its layer + barrel; don't restructure or fork it into `src/components`.
- `src/vendor/shared/**` — mirrored from `server/`; edit both copies together.
- `.next/**` — build output, git-ignored.
