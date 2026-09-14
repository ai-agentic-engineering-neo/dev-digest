# client/CLAUDE.md — `@devdigest/web`

Stack, route map, testing notes: [README.md](README.md). This file only adds
what an agent working in this folder wouldn't guess from the README.

Read [LEARNINGS.md](LEARNINGS.md) before starting work here — treat it as
high-confidence guidance unless it's obviously stale.

## Non-default conventions

- UI primitives are vendored under `src/vendor/ui` (`@devdigest/ui`) and shared
  contracts under `src/vendor/shared` (`@devdigest/shared`) — path aliases, not
  published packages; there's no sync script, both are manually maintained copies.
- All data access goes through `src/lib/hooks/*` → `src/lib/api.ts` — don't
  `fetch` directly in a component; `NEXT_PUBLIC_API_BASE` is the one API base.
- Pages (`src/app/**/page.tsx`) stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- i18n messages live in `messages/<locale>/*.json` (`next-intl`) — new UI
  strings need an entry there, not inline literals.

## Do-not-touch

- `src/vendor/shared` — an independent copy from `server/src/vendor/shared`,
  not auto-synced and already drifted (e.g. missing the `openrouter` provider
  id, missing `CommitFile`/`CommitFilesPayload` — see root `CLAUDE.md`).
  Editing shared contracts here does not propagate to the server copy.
- `src/vendor/ui` — vendored primitives with no upstream resync mechanism;
  treat as owned source, not a dependency to bump.

## Gotchas

- Component tests (`*.test.tsx`, vitest + jsdom) mock `fetch` — they verify
  rendering/interaction, not real API integration. Only the `e2e` suite
  (agent-browser, real stack) catches client↔API integration breaks.
- Server-rendered vs client components: check for the `"use client"` boundary
  before adding hooks/state to a page component — App Router pages default to
  server components.

## Testing

`pnpm test` (vitest + jsdom, `fetch` mocked, no API needed).

## Read when

- Following data from a hook through the API into the server:
  [../docs/architecture.md](../docs/architecture.md).
- Testing/CI questions, or real browser journeys: [../TESTING.md](../TESTING.md), [`../e2e`](../e2e/README.md).
- Building the agent editor / system-prompt UI: [../docs/agent-prompts](../docs/agent-prompts/).
- Building a feature that has a spec: [../specs/](../specs/).

Finishing a substantive task here (bug fix, non-trivial change, discovery)?
Append an entry to [LEARNINGS.md](LEARNINGS.md) — don't skip it.
