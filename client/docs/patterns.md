# client — patterns

## 1. Add a data hook for a new or changed endpoint
1. Make sure the response schema exists in `src/vendor/shared/contracts/*.ts` (same field the server added; two copies).
   Re-export the type from `src/lib/types.ts` if pages import it from there.
2. Add the hook to the matching domain file in `src/lib/hooks/` (`core.ts` for settings/repos/pulls, `reviews.ts`,
   `agents.ts`, `trace.ts`, `repo-intel.ts`). Shape: `useQuery({ queryKey: ["<entity>", id], queryFn: () => api.get<T>(\`/path/${id}\`), enabled: !!id })`.
   Polling while work is in flight: copy `usePrRuns` (`refetchInterval` returns 4000 or false).
3. Mutations invalidate or `setQueryData` on the affected keys (`useUpdateSettings`, `useTestConnection` in `core.ts`).
4. If the domain file is new, add `export * from "./<domain>"` to `src/lib/hooks/index.ts`.
5. In tests, mock `fetch` (jsdom, no API) or render the component with fixture props; see `PRRow.test.tsx`.

## 2. Add a screen or a feature component
1. Write `specs/NNN-<feature>.md` (template in `specs/README.md`) naming screens, contract fields, i18n keys, tests, and the e2e flow.
2. Route: create `src/app/<route>/page.tsx` as a thin `"use client"` entry that renders `_components/<View>/`
   (`src/app/settings/[section]/page.tsx`). Wrap in `AppShell` with breadcrumbs (`src/app/repos/[repoId]/pulls/page.tsx`).
3. Component folder: `_components/<Name>/{<Name>.tsx, <Name>.test.tsx, index.ts, styles.ts, helpers.ts, constants.ts}`.
   Reusable across routes → `src/components/<kebab>/` with an `index.ts` barrel (`src/components/run-cost-badge/index.ts`).
4. UI primitives from `@devdigest/ui` (`Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `Icon`); styles as `satisfies CSSProperties`
   objects in `styles.ts` using CSS variables (`var(--text-secondary)`), see `FindingsPanel/styles.ts`.
5. Strings: add keys to `messages/en/<ns>.json` with a targeted text edit, then `useTranslations("<ns>")`. Plurals use ICU
   (`common.findingsPopover.run`). Check `git diff messages/` for stray reformatting.
6. Test with React Testing Library under `NextIntlClientProvider` and the real JSON namespace
   (`src/components/run-cost-badge/RunCostBadge.test.tsx`). Cover the "unknown/empty" rendering, not only the happy path.
7. If the user journey changes, add or extend a flow in `e2e/specs/NN-<name>.flow.json` and list it in the spec's acceptance criteria.
8. Gate: `pnpm lint` → `pnpm typecheck` → `pnpm test`.

## 3. Show a new field from an existing endpoint (no new request)
1. Add the field to the contract copy in `src/vendor/shared/contracts/<domain>.ts` as `.nullish()`/`.nullable()`.
2. Format it in a pure helper under `src/lib/` (`format-cost.ts`) and render through a small shared component
   (`RunCostBadge`) so PR list, timeline, and drawer stay consistent.
3. Handle `null` explicitly (render "—"); add the column key to the page's `constants.ts` (`COLUMN_KEYS`) and its i18n label.
4. Worked example: `specs/001-run-cost-badge.md` (three surfaces, one helper, one component, four tests).

## Do not
- Call `fetch` in a component or page; go through a hook.
- Hardcode user-visible text; add an i18n key.
- Reformat `messages/en/*.json` by loading and dumping JSON.
- Add a `set-state-in-effect` site: the rule is `warn` in `eslint.config.mjs` only for legacy code.
