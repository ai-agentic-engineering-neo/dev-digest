# Intent Layer (client)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `server/` and `client/`, so it keeps **one** spec:
[../../server/specs/L03-intent-layer.md](../../server/specs/L03-intent-layer.md) —
goal, non-goals, contracts, routes, data sources, confidence rules and
acceptance criteria all live there.

This file records only what is client-specific.

## UI surface

- **`_components/IntentCard/`** (route-local, under
  `app/repos/[repoId]/pulls/[number]/_components/`), rendered by
  `OverviewTab` above the Description section.
  - **ready** — a `Card` with a `SectionLabel` "Intent", a confidence
    `Badge` (dot) and a "Regenerate" `Button`; an italic one-sentence quote;
    an IN SCOPE / OUT OF SCOPE two-column list; an optional low-confidence /
    downgraded / stale hint line; a SOURCES row of compact badges; a mono
    meta line `{model} · {cost}`.
  - **loading** — a `Skeleton` block inside `Card`, `role="status"`.
  - **empty** (`intent: null`) — `EmptyState` with a "Generate intent" CTA.
  - **error** — `ErrorState` for the query; an inline `role="alert"` for a
    failed derive.
- `RunTraceDrawer` → `TraceBody` shows a `PromptBlock` "Intent (dynamic)"
  when `prompt_assembly.intent != null`.

## Data layer

`src/lib/hooks/intent.ts` (not re-exported from the `hooks/index.ts` barrel
— frontend-ui-architecture §11 forbids `export *`; import it directly):
`usePrIntent(prId)` (query, key `["pr-intent", prId]`), `useDeriveIntent(prId)`
(mutation — it costs a model call, so it must never run on mount/refocus/
retry; seeds the query cache from its own response, same pattern as
`useExtractConventions`).

## i18n

New namespace `client/messages/en/intent.json` (next-intl loads every file
under `messages/en/` as its own namespace).

## Test plan

Colocated Vitest + RTL, mocking the hook module (client INSIGHTS: use
`fireEvent`, not `user-event`, which is not a dependency here):

| File | Covers |
|------|--------|
| `IntentCard/IntentCard.test.tsx` | loading / empty / ready / stale / error states, Regenerate, sources |
| `RunTraceDrawer/RunTraceDrawer.test.tsx` | the new "Intent (dynamic)" prompt block |
