# client — @devdigest/web

Next.js 15 App Router studio UI. Route map and testing notes: `README.md`.

## Rules
- Pages stay thin; feature logic lives in colocated `_components/<Name>/` folders, each with a `*.test.tsx`.
- All data access goes through hooks in `src/lib/hooks/*` → `src/lib/api.ts` (TanStack Query). No ad-hoc `fetch` in components.
- User-facing strings go in `messages/<locale>/*.json` (next-intl).
- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- Tests: vitest + jsdom with `fetch` mocked; no API or browser needed.

## Gotchas
- `src/vendor/shared` (contracts) has a drifted twin in `server/`; `src/vendor/ui` is vendored UI primitives (`@devdigest/ui`). Treat both as shared, not local.
- `/onboarding` is just "add repo" — NOT the M5 Onboarding generator.

## Look here when relevant (not auto-loaded)
- `docs/` explanations · `specs/` feature briefs · `INSIGHTS.md` learned gotchas
- Test strategy: `../TESTING.md`
- Where code goes / how to split components: skill `frontend-ui-architecture` (`.claude/skills/frontend-ui-architecture/`)
