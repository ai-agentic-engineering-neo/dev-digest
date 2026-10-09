# client (`@devdigest/web`) — agent map

Next.js studio: add repos, browse PRs, run and read reviews, edit agents.
Overview and UI route map: [README](README.md).

## Stack

Node ≥ 22 · TypeScript · Next.js 15 (App Router) · React 19 · TanStack Query ·
Tailwind CSS 4 · next-intl · recharts · mermaid · react-markdown · Zod 3 ·
Vitest + React Testing Library + jsdom · pnpm.

## Commands

```sh
pnpm install
pnpm dev         # :3000 — needs the API on :3001 (../scripts/dev.sh)
pnpm test        # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
```

## Where things live

- `src/app/**/page.tsx` — routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature UI, colocated with its `*.test.tsx`
- `src/lib/hooks/*` — TanStack Query hooks; `src/lib/api.ts` — the only HTTP client
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui/` (`@devdigest/ui`) — UI primitives; `src/vendor/shared/` — Zod contracts
- `messages/en/*.json` — UI strings (next-intl)

## Conventions

- Data access only through hooks in `src/lib/hooks` → `src/lib/api.ts`; no ad-hoc `fetch` in components.
- User-visible text goes into `messages/en/*.json`, not inline strings.
- New component = `_components/<Name>/` folder with its own test; nested components nest the same way.
- Reuse primitives from `@devdigest/ui` before writing new ones.
- API base URL comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Gotchas

- `src/vendor/shared` is a copy of `server/src/vendor/shared` and has drifted — when a
  contract changes, update both and keep types in sync.
- Component tests mock `fetch`; real browser journeys live in [../e2e](../e2e/AGENTS.md).
  If you change text or URLs a flow waits on, update the matching `e2e/specs/*.flow.json`.

## Read before you work

- Feature spec for the task → [specs/](specs/README.md)
- Deeper reference → [docs/](docs/README.md) · test strategy → [../TESTING.md](../TESTING.md)
- Past learnings → [INSIGHTS.md](INSIGHTS.md) — read before non-trivial work; new entries are
  added by the `engineering-insights` skill (append-only, no duplicates).
