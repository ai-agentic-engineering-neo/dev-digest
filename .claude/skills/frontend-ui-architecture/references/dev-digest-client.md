# dev-digest `client/` — how the rules map to this repo

Source of truth is `client/AGENTS.md`; this file only maps the skill's rules onto it. If they disagree, `client/AGENTS.md` and the code win — fix this file.

Stack: Next.js 15 App Router, React 19, TanStack Query, pnpm. Commands: `pnpm test`, `pnpm typecheck` (from `client/`).

## Layers → paths

| Skill layer | dev-digest path |
|---|---|
| Routes | `src/app/**/page.tsx` — thin |
| Features | `src/app/<route>/_components/<Name>/` (route-colocated; nested `_components/` for children) |
| Shared UI | `src/components/<area>/` (kebab-case area folder, e.g. `diff-viewer/`, `app-shell/`; PascalCase component subfolders inside) |
| Shared lib | `src/lib/` — `api.ts` (only API client), `hooks/<domain>.ts` (all React Query hooks), `providers.tsx`, `repo-context.tsx`, `theme.tsx`, `toast.tsx`, purpose-named utils (`github-urls.ts`, `model-label.ts`) |
| Vendor / contracts | `src/vendor/ui` (`@devdigest/ui` design kit — extend, don't restyle) · `src/vendor/shared` (`@devdigest/shared` Zod contracts — mirror of server; change the server copy first) |
| i18n | `messages/en/<namespace>.json`, `useTranslations("<ns>")` |

## Component folder (repo convention)

```
_components/<Name>/
  <Name>.tsx
  index.ts       // export { Name, Name as default } from "./Name"
  styles.ts      // export const s = { ... } — CSSProperties objects with CSS vars
  constants.ts   // optional
  helpers.ts     // optional, + helpers.test.ts
  <Name>.test.tsx
  _components/   // children
```

- Styling goes through `styles.ts`; `className` only for global utility classes (`mono`, `tnum`).
- The default + named export in `index.ts` is the repo convention — keep it (it overrides the skill's "named exports" preference).

## Data

- Components never call `fetch` / `apiFetch`. Add a hook in `src/lib/hooks/<domain>.ts` (`core`, `agents`, `reviews`, `trace`, `repo-intel`) and export it from `src/lib/hooks/index.ts`.
- `src/lib/hooks/index.ts` is a mandated aggregate barrel — keep using it; don't add new aggregate barrels elsewhere.
- Query keys are currently inline arrays in each hook (e.g. `["pr-active-runs", prId]`). When touching a domain file with several related queries, a per-domain key factory / `queryOptions()` is the recommended direction — keep keys inside `lib/hooks`, never in components.

## Types

- `Severity` and other API types come from `@devdigest/shared` (CRITICAL/WARNING/SUGGESTION). `@devdigest/ui` exports its own `Severity` that also includes `INFO` — don't type API data with it (see `client/INSIGHTS.md`).

## Existing examples to imitate

- Feature with nested children, helpers, constants, tests: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`
- Route-level helpers/constants shared by sibling components: `src/app/repos/[repoId]/pulls/{helpers,constants}.ts`
- Shared UI area with its own helpers/constants: `src/components/diff-viewer/`, `src/components/app-shell/` (incl. `hooks/`)
