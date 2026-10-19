# client — @devdigest/web

Next.js 15 studio UI over the Fastify API. Human docs: `README.md` (source of truth).

## Where things live
- `src/app/**/page.tsx`   routes (App Router); screens in `_components/` next to the page
- `src/lib/api.ts`        the only fetch layer (`NEXT_PUBLIC_API_BASE`, default :3001)
- `src/lib/hooks/*`       every TanStack Query data hook
- `src/components/`       app-level components (app-shell, diff-viewer, …)
- `src/vendor/ui/`        `@devdigest/ui` primitives, incl. widgets for future lessons
- `src/vendor/shared/`    Zod contracts — copy #2 of 2 (see root CLAUDE.md)
- `messages/en/*.json`    UI strings (next-intl)

## Conventions (non-default)
- Components never call `fetch` directly — go through a hook in `src/lib/hooks`
  that uses `src/lib/api.ts`.
- User-visible text goes into `messages/en/*.json`, not inline strings.
- Tests: vitest + jsdom with fetch mocked — no running API needed.

## Gotchas
- `/onboarding` is the "Add repository" screen, not the L05 Onboarding generator.
- `src/vendor/shared` has already drifted from the server copy — when a type
  looks wrong, diff it against `server/src/vendor/shared` first.

## Read when
- Adding a page or changing which API a page uses → README.md §UI route map.
- Writing component tests → README.md §Testing and ../TESTING.md.
- Implementing a UI feature → its spec in `specs/`.
- Before any edit here → INSIGHTS.md.
