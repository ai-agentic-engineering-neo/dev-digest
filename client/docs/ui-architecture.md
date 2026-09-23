# UI architecture

How the studio is built **today**. Stack, commands and the route map are in
[`../README.md`](../README.md); conventions and naming are in
[`../CLAUDE.md`](../CLAUDE.md); what each page must keep showing is in
[`../specs/pages.md`](../specs/pages.md). This file covers the Server/Client
boundary, how data reaches a component, and what refreshes it. Paths are relative
to `client/`.

## Server vs Client Components

- **Root layout** (`src/app/layout.tsx:14-16`) is `async`: it reads the locale and *all* messages on the
  server and renders `NextIntlClientProvider → Suspense (fallback null) → Providers` (`layout.tsx:28-32`).
- **Two thin Server wrappers**, `src/app/agents/page.tsx:5-7` and `src/app/settings/[section]/page.tsx:5-7`,
  only render a client view (`AgentsListView.tsx:3`, `SettingsView.tsx:4`).
- **Every other page is a Client Component** (`src/app/page.tsx:2`, `src/app/onboarding/page.tsx:3`,
  `src/app/repos/[repoId]/pulls/page.tsx:3`, `src/app/repos/[repoId]/pulls/[number]/page.tsx:6`,
  `src/app/agents/[id]/page.tsx:4`).
- **Nothing fetches on the server.** The only `fetch` is `src/lib/api.ts:24`. There is no `loading.tsx`,
  `error.tsx` or `not-found.tsx` in `src/app/`: each page draws its own `Skeleton` or `ErrorState`, and
  an unknown URL gets Next's built-in 404.

So the server renders only the shell and the i18n messages; all data loads in client islands after
hydration. The whole catalog, including namespaces no screen reads yet, is serialized into every page:
`src/i18n/request.ts:16-25` loads every file and `layout.tsx:16,28` passes them all.

## Providers and global errors

`src/lib/providers.tsx:47-53` nests the providers, outermost first: `QueryClientProvider → ThemeProvider →
ToastProvider → RepoProvider`. The `QueryClient` is created once, in `useState` (`providers.tsx:22`), with
`retry: 1`, `staleTime: 30 s`, `refetchOnWindowFocus: false` (`providers.tsx:26-30`). Overrides:
`useRunTrace` never retries (`src/lib/hooks/trace.ts:17`), `useProviderModels` stays fresh 5 min
(`agents.ts:89`), `usePulls` refetches on focus (`core.ts:110`).

- A failed **query** toasts only on a network failure (status 0) or ≥ 500; a non-`ApiError` counts as 500
  (`providers.tsx:35-40`). A 4xx stays silent so the page can show it inline. A failed **mutation**
  always toasts (`providers.tsx:41-43`), via the hook-free `notify` bridge (`src/lib/toast.tsx:30-39`).
- Exceptions: `DiffTab` toasts and rethrows on a failed comment post (`DiffTab.tsx:36-39`), so the user
  sees two toasts. `AddRepoView` shows the error inline (`AddRepoView.tsx:36-38`) as well as the global
  toast. SSE failures reach neither cache, so `useRunEvents` toasts `error` events itself
  (`src/lib/hooks/reviews.ts:186-189`).

## Network layer (`src/lib/api.ts`)

- `API_BASE` is `NEXT_PUBLIC_API_BASE`, else `http://localhost:3001` (`api.ts:5-6`), inlined at build
  time by `next.config.mjs:8-10`. The only other network call is `EventSource` (`reviews.ts:181`).
- `content-type: application/json` is sent only with a body (`api.ts:27-30`); `post`/`put`/`patch` send
  none for a falsy payload (`api.ts:67-72`). A 204 returns `undefined` (`api.ts:61`).
- A thrown `fetch` becomes `ApiError(0, "network_error")`, "Cannot reach the DevDigest engine at … Is the
  API running?" (`api.ts:34-42`). A non-2xx becomes `ApiError` built from `{ error: { code, message,
  details } }`, else `"<status> <statusText>"` (`api.ts:44-58`).

## Hooks, query keys, invalidation

All hooks live in `src/lib/hooks/*.ts`, re-exported by `src/lib/hooks/index.ts:4-8`. `["context", repoId]`
(`core.ts:123-136`) and `["repo-intel-state"]` have hooks but no screen yet.

| Key | Hook → endpoint | Refetch | Written by |
| --- | --- | --- | --- |
| `["settings"]` | `useSettings` → `GET /settings` (`core.ts:23-28`) | — | `useUpdateSettings` sets data (`core.ts:34`) |
| `["secrets-status"]` | `useSecretsStatus` → `GET /settings/secrets-status` (`core.ts:58-64`) | — | `useTestConnection` when `ok` (`core.ts:48-53`) |
| `["repos"]` | `useRepos` → `GET /repos` (`core.ts:67-72`) | — | add / refresh / delete repo (`core.ts:78,87,97`) |
| `["pulls", repoId]` | `usePulls` → `GET /repos/:id/pulls` (`core.ts:102-112`) | every 60 s + on focus | `useRefreshRepo` only (`core.ts:88`) |
| `["pull", prId]` | `usePullDetail` → `GET /pulls/:id` (`core.ts:114-120`) | — | never |
| `["agents"]` | `useAgents` → `GET /agents` (`agents.ts:8-13`) | — | create / update / delete (`agents.ts:38,66,77`) |
| `["agent", id]` | `useAgent` → `GET /agents/:id` (`agents.ts:15-21`) | — | update sets data, delete removes it (`agents.ts:67,78`) |
| `["provider-models", p]` | `useProviderModels` → `GET /providers/:p/models` (`agents.ts:84-91`) | — | `useTestConnection` when `ok` (`core.ts:50`) |
| `["pr-active-runs", prId]` | `usePrActiveRuns` → `GET /pulls/:id/runs/active` (`reviews.ts:28-35`) | every 4 s while non-empty | PR page (`page.tsx:51-53`) |
| `["pr-runs", prId]` | `usePrRuns` → `GET /pulls/:id/runs` (`reviews.ts:40-48`) | every 4 s while a run is `running` | `useDeleteRun` (`reviews.ts:67`), PR page (`page.tsx:56-58`) |
| `["reviews", prId]` | `usePrReviews` → `GET /pulls/:id/reviews` (`reviews.ts:51-57`) | — | delete run / review, run review, finding action (`reviews.ts:68,85,133,158`) |
| `["pr-comments", prId]` | `usePrComments` → `GET /pulls/:id/comments` (`reviews.ts:91-97`) | — | `useCreatePrComment` (`reviews.ts:113`) |
| `["run-trace", runId]` | `useRunTrace` → `GET /runs/:id/trace` (`trace.ts:12-19`) | no retry | never |
| `["repo-intel-state", repoId]` | `useRepoIntelStatus` → `GET /repos/:id/index-state` (`repo-intel.ts:31-38`) | every 1.5 s when `poll` | `useResyncRepoIntel` (`repo-intel.ts:46`) |

- **`["pulls", repoId]` is shared.** Every `AppShell` mounts `usePulls` to drive the sidebar's
  needs-review badge (`src/components/app-shell/hooks/useShellContext.ts:28,75`). The 60 s poll therefore
  runs on every screen while a repo is active. The PR page reads the same cached list to turn
  `:number` into the PR's uuid (`src/app/repos/[repoId]/pulls/[number]/page.tsx:33-36`).
- **A review never invalidates `["pulls"]`.** `useRunReview` touches only `["reviews", prId]` (`reviews.ts:132-134`).
  The list's SCORE, FINDINGS, COST and status catch up through the 60 s poll, a window-focus refetch or
  **Refresh** (`core.ts:86-89`).
- **The PR page adds its own invalidations.** It invalidates `["pr-active-runs"]` when runs start
  (`page.tsx:133`). When the live streams close, it invalidates `["pr-active-runs"]` and `["pr-runs"]`
  and refetches `["reviews"]` (`page.tsx:156-160`). `useCancelRun` invalidates nothing
  (`reviews.ts:74-78`); the 4 s polls pick up the cancellation.

## Live runs (SSE)

`useRunEvents(runIds)` (`reviews.ts:168-216`) opens one `EventSource` per run at `/runs/:id/events`
(`reviews.ts:180-181`). It listens to default messages and to the named events `info`, `tool`, `result`
and `error` (`reviews.ts:196-199`), and appends the parsed `RunEvent`s. When a stream errors, the hook
closes it; `running` turns false once all streams are closed (`reviews.ts:200-204`). The effect is keyed
on the joined ids, so any change to the set reopens every stream and clears the events
(`reviews.ts:171-176,213`).

- **`RunStatus`** (`RunStatus.tsx:20-26`) renders the log. It calls `onDone` when `running` changes
  from true to false, which fires the PR page's `onRunDone`.
- **`RunTraceDrawer`** subscribes only when its `running` prop is true (`RunTraceDrawer.tsx:45-49`). The
  page never passes it (`page.tsx:175-181`). So the drawer opens on the Trace tab, streams nothing, loads
  the saved trace and labels the run "completed" (`RunTraceDrawer.tsx:67`). That holds even when it is
  opened from Live review's "Open run trace" (`FindingsTab.tsx:48-50,101`). If the trace returns 404
  (`../server/src/modules/reviews/routes.ts:121-126`), the drawer shows "No trace available yet."
  (`RunTraceDrawer.tsx:98-100`); a 4xx raises no toast.

## i18n

- One locale, `en`, no locale routing (`src/i18n/request.ts:14,27-30`); plugin wired in
  `next.config.mjs:3,13`. Each `messages/en/<ns>.json` becomes namespace `<ns>` (`request.ts:19-23`).
- Only client `useTranslations` is used; the namespaces read today are `prReview`, `runs`, `agents`,
  `settings`, `shell` and `common`.
- **Some copy is hardcoded English JSX.** e2e flows assert some of it, so move a string to `messages/`
  only if its text stays the same. It sits in the root page (`src/app/page.tsx:23,33-35`),
  `AddRepoView.tsx:77,94,136`, the PR page (`page.tsx:85,115-116,153`),
  `PrDetailHeader.tsx:90,106-107,116-118`, `FindingsTab.tsx:99-165`, `ReviewRunAccordion.tsx:98-99,120`,
  `OverviewTab.tsx:16`, `DiffTab.tsx:37,55,60` and the agent editor page
  (`src/app/agents/[id]/page.tsx:35-37,45,69,112`).
- **Some vendored copy is English too:** nav labels, settings sections and the shortcut list
  (`src/vendor/ui/nav.ts:25-26,39-42,51-59`). The shortcut list still says "Dismiss finding" for `d`
  (`nav.ts:58`), while the card button says "Reject".

## Styling and theme

- **Styles are colocated** in `styles.ts` as `s`: objects with `satisfies CSSProperties`, or functions
  when they take arguments (`FindingsPanel/styles.ts:28-46`); colours are CSS variables. Older ports
  still style inline (`RunHistory.tsx:40-76`, `ReviewRunAccordion.tsx:64-141`, `AddRepoView.tsx:42-143`).
- **Tailwind is loaded but not used.** `globals.css:5` imports `src/vendor/ui/styles.css`, which does
  `@import "tailwindcss"` and defines the tokens per `[data-theme]` (`styles.css:1,9-10,49`).
  Components use no Tailwind utilities; the only classes are `mono` and `tnum` (`styles.css:144,221`).
- **Theme.** `<html>` starts with `data-theme="dark" data-density="regular"` (`layout.tsx:18`). An inline
  script applies `localStorage["dd-theme"]` before paint (`layout.tsx:21`, `src/lib/theme.tsx:44`).
  `ThemeProvider` reads the attribute back (`theme.tsx:17-20`), and `set` writes both the attribute and
  `localStorage["dd-theme"]` (`theme.tsx:22-30`).
- **Aliases.** UI primitives come from the `@devdigest/ui` barrel (`src/vendor/ui/index.ts:4-13`). The
  aliases are declared in `tsconfig.json:22-28` and `vitest.config.ts:8-12`.

## App shell, active repo, shortcuts

- **`AppShell`** combines the vendored `AppFrame`, `CommandPalette` and `ShortcutsHelp`
  (`src/components/app-shell/AppShell.tsx:22-30`). Each page renders its own `AppShell`; the layout does
  not. `/onboarding` has none: `AddRepoView` draws a full-screen card.
- **Shell context** (`useShellContext.ts:22-91`) supplies the active nav key from the path
  (`helpers.ts:26-40`), the repo switcher (select, add, remove with a confirm; `useShellContext.ts:31-58`),
  the theme toggle and the needs-review badge. The **command palette** offers "Go to …" for each nav
  item, plus Settings and the theme toggle (`useShellCommands.ts:20-47`).
- **Active repo.** `RepoProvider` picks it in this order: the `/repos/:id` path, then
  `localStorage["dd-repo"]`, then the first repo (`src/lib/repo-context.tsx:47-48`). `useRepoNotFound`
  turns true only after repos have loaded and the id matches none of them (`repo-context.tsx:69-72`).
- **Shortcuts.** Cmd/Ctrl+K opens the palette and `?` opens help; both ignore text inputs
  (`useGlobalShortcuts.ts:27-36`). `g` then `p` / `a` / `,` navigates if the second key comes within
  1200 ms (`useGlobalShortcuts.ts:37-48`, `constants.ts:4`, `src/vendor/ui/nav.ts:25-26,36`).

## Known pitfalls

- **Duplicate finding actions across runs.** Each mounted `FindingsPanel` binds `j`/`k`/`a`/`d` on
  `window` (`FindingsPanel.tsx:49-61`). Every expanded Review run mounts its own panel
  (`ReviewRunAccordion.tsx:144-164`), so with several runs open one `a` or `d` press accepts or rejects
  the focused finding in each run.
- **`g a` accepts a finding.** On the Agent runs tab, `g a` also accepts the focused finding. The global
  `g`-chord and the panel both handle `a`, and neither stops the other (`useGlobalShortcuts.ts:37-47`,
  `FindingsPanel.tsx:55-56`, `FindingsPanel/constants.ts:15-18`). Read from the code, not reproduced.
