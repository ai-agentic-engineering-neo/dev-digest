# Layout reference

## Contents
- Target tree of `client/`
- Route segment anatomy (Next.js App Router)
- Promotion / demotion rules
- Naming table

## Target tree of `client/`

```
client/
├── messages/en/<feature>.json         # next-intl namespaces, one per feature
└── src/
    ├── app/                           # routing only + route-local features
    │   ├── layout.tsx                 # root: html/body, intl provider, <Providers>
    │   ├── page.tsx
    │   ├── agents/
    │   │   ├── page.tsx               # thin → <AgentsListView/>
    │   │   ├── _components/
    │   │   │   ├── AgentsListView/    # the screen
    │   │   │   │   ├── index.ts
    │   │   │   │   ├── AgentsListView.tsx
    │   │   │   │   ├── constants.ts · helpers.ts · styles.ts
    │   │   │   │   └── _components/CreateAgentModal/
    │   │   │   └── AgentCard/         # used by AgentsListView only
    │   │   └── [id]/
    │   │       ├── page.tsx
    │   │       └── _components/AgentEditor/
    │   └── repos/[repoId]/pulls/[number]/_components/…
    ├── components/                    # shared UI used by ≥2 routes
    │   ├── app-shell/                 # AppShell.tsx, hooks/, constants.ts, helpers.ts, index.ts
    │   └── diff-viewer/               # index.ts exposes DiffViewer + DiffCommentApi only
    ├── lib/
    │   ├── api.ts                     # fetch client + ApiError (only I/O entry point)
    │   ├── hooks/                     # TanStack Query hooks, one file per API domain
    │   │   ├── index.ts               # curated re-export
    │   │   └── core.ts · agents.ts · reviews.ts · trace.ts · repo-intel.ts
    │   ├── providers.tsx              # QueryClient + theme + toast + repo providers
    │   ├── repo-context.tsx · theme.tsx · toast.tsx
    │   └── format-usage.ts · github-urls.ts   # generic pure utils (+ tests)
    ├── i18n/request.ts
    ├── test/setup.ts
    └── vendor/
        ├── ui/        # @devdigest/ui — do not edit
        └── shared/    # @devdigest/shared — mirror of server contracts
```

## Route segment anatomy (Next.js App Router)

| File / folder | Role | Rule here |
|---|---|---|
| `page.tsx` | makes the segment routable | thin; renders one View |
| `layout.tsx` | shared UI for the segment subtree | chrome only, no feature logic |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | Suspense / error boundaries | small, reuse `@devdigest/ui` states |
| `_folder` | private folder, never routed | all colocated UI lives in `_components` |
| `(group)` | route group, no URL segment | only for a shared layout or split roots |
| `[param]` | dynamic segment | read params in page, pass typed values down |

Anything not named `page`/`route` inside `app/` is not public, so colocating is
safe; the `_` prefix still makes intent explicit and avoids future name clashes.

## Promotion / demotion rules

```
used by 1 component   → <Name>/ (constants.ts, helpers.ts, _components/)
used by 2+ siblings   → nearest common parent folder (its _components/ or helpers.ts)
used by 2+ routes     → src/components/<kebab-name>/   (UI)
                        src/lib/<purpose>.ts           (pure logic)
used by server too    → @devdigest/shared (both vendor copies)
```

When promoting: move the folder with its tests, export through `index.ts`, switch
consumers to the alias import, delete the old path (no re-export shims).
When the last extra consumer is gone, move it back down.

## Naming table

| Thing | Convention | Example |
|---|---|---|
| Component folder/file | PascalCase | `FindingCard/FindingCard.tsx` |
| Shared component folder | kebab-case | `components/diff-viewer/` |
| Screen component | `<Feature>View` | `AgentsListView`, `SettingsView` |
| Hook | `use` + PascalCase, file = hook name | `useGlobalShortcuts.ts` |
| Data hooks | `use<Entity>` / `use<Verb><Entity>` | `useAgents`, `useCreateAgent` |
| Lib module | kebab-case by purpose | `format-usage.ts` |
| Constant | SCREAMING_SNAKE | `MODEL_COLOR`, `USD_FLOOR` |
| Styles object | `s` from `styles.ts` | `style={s.card(active)}` |
| i18n namespace | camelCase feature | `useTranslations("prReview")` |
| Tests | same basename + `.test.ts(x)` | `helpers.test.ts` |
