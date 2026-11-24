# Data, state and business logic

Source IDs resolve in `../README.md` → "Sources".

## Three homes

| Kind | Home | Rule |
|---|---|---|
| Server data (PRs, runs, findings, agents, settings) | TanStack Query in `lib/hooks/<domain>.ts` | Cache owned by the server; never copied into `useState` [S47, S43] |
| UI state (open tab, selected finding, draft text) | `useState`/`useReducer` in the lowest component that needs it; URL for shareable state | Lift only to the nearest common parent [S42, S06] |
| Business rules (filter, sort, verdict, cost, label, URL building) | Pure TS: `<Name>/helpers.ts` → `lib/<topic>.ts` | No React imports; unit-tested without rendering [S60, S57, S62] |

## Hooks layer (`lib/hooks`)

client/CLAUDE.md: *data only via a hook from `lib/hooks`; a direct fetch inside a component is
forbidden.* This is the Bulletproof "API layer" with requests declared outside components [S30];
the domain split of files (`agents.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts`, `core.ts`)
plays the role of `features/<x>/api`.

For **new** queries, write a `queryOptions` factory and build the hook on it [S49, S50, S24]:

```ts
// lib/hooks/reviews.ts
export const prRunsOptions = (prId: string) =>
  queryOptions({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
  });

export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    ...prRunsOptions(prId ?? ""),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// invalidation reuses the same key source:
qc.invalidateQueries({ queryKey: prRunsOptions(prId).queryKey });
```

- Shared options stay minimal (key + fn); per-screen knobs (`staleTime`, `select`, `enabled`,
  polling) are set where they are used [S50].
- A hook that only wraps `useQuery` with no extra logic is optional; keep the hook when it adds
  behaviour (enabled guards, polling, SSE wiring) or when CLAUDE.md's "only via a hook" rule
  needs a named entry point.
- Keys go general → specific (`["reviews", prId]`, `["pr-runs", prId]`) and live with the
  domain file, not in a global key registry [S48].
- Mutations invalidate by key in `onSuccess`; components don't call `invalidateQueries` with
  hand-typed keys.
- SSE (`/runs/:id/events`) stays in a hook in `lib/hooks`; the EventSource lifecycle is the one
  legitimate `useEffect` there.

Superseded advice: "one custom hook per query + separate key factories" (TkDodo 2020–21) — cite
only as history [S47, S48 vs S49].

## API boundary (`lib/api.ts`)

- One client (`apiFetch`, `api.get/post/put/del`), one base URL, one error type (`ApiError`)
  that UI branches on (toast / inline / full-screen) [S30].
- Response types come from `@devdigest/shared` (type-only import). A generic on the call
  (`api.get<T>`) is a cast, not a check [S51]. Where a wrong shape would corrupt UI state
  (persisted JSON, SSE events), parse with the contract's Zod schema **inside the fetcher/hook**
  so invalid data becomes a normal query `error` [S51].
- If a backend shape is awkward for the UI, map DTO → view model in the hook/fetcher layer
  (`select` or a mapper in `lib/`); components never see raw wire quirks. Skip the mapper when
  the contract already fits [S58].
- Remember the vendored contracts lag the server (client/CLAUDE.md Gotchas); changing a contract
  means changing both copies (root CLAUDE.md).

## Business logic

- Extract any branching that encodes a product rule out of JSX and hook bodies into a named
  pure function: `filterFindings(findings, severity)`, `modelColor(model)`,
  `githubPrUrl(repo, n)`, `formatCost(usd)` [S60].
- Pure functions get `helpers.test.ts` / `<topic>.test.ts` next to them — cheaper and more
  precise than RTL tests of the same rule [S62].
- Replace scattered `if (x === "A") … else if (x === "B")` across components with one lookup map
  in `constants.ts` or a strategy object passed in [S60].
- Do **not** introduce use-case classes, DI containers or ports for plain GET-and-render screens;
  the only mandatory parts of "clean architecture on the frontend" here are: domain logic
  without React, and dependencies pointing inward [S57, S62].

## Custom hooks

- Hooks share stateful *logic*, not state — each call is independent [S08].
- Name `useX` only if it calls a hook; otherwise it's a plain function in `helpers.ts` [S08].
- Avoid lifecycle wrappers (`useMount`, `useEffectOnce`) and one-line wrappers over `useState`
  [S08].
- Place: `<Name>/hooks/useX.ts` (or inline) → `components/<x>/hooks/` → `lib/` as consumers grow
  (see `app-shell/hooks/useGlobalShortcuts.ts`).

## Global client state

Order: local → lifted → composition → context [S43, S42]. Existing contexts (`theme`, `toast`,
`repo-context`) cover cross-cutting needs. Don't add Redux/Zustand; if a store ever becomes
necessary, model actions as events, keep transition logic in the store, expose only hooks, and
prefer several small stores [S25, S53]. Form state stays local to the form; server data only
seeds `defaultValues`; after a mutation, invalidate and reset [S52].
