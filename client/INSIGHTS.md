# Insights — client

Lessons learned in `client/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->
- 2026-09-22 — src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.test.tsx: a screen test that must reach useRepoNotFound (stale :repoId) needs the real <RepoProvider> around the view (it loads GET /repos) plus vi.mock('next/navigation') with usePathname/useSearchParams/useRouter (vi.hoisted state), and AppShell mocked as a children passthrough → copy this setup for other repo-scoped screens instead of rendering the real shell
- 2026-09-22 — src/test/render.tsx + fetch-mock.ts + fake-event-source.ts: renderWithProviders (all messages/en namespaces, fresh QueryClient retry:false, ToastProvider) + mockFetch({'POST /findings/:id/:action': ...}) lets component tests run the real TanStack hooks and assert the requests sent → stub fetch/EventSource, do not vi.mock('@/lib/hooks/*')

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->
- 2026-09-22 — src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer: the drawer picks its initial tab (log vs trace) from the running prop at mount (useState), so PrDetailView derives running from usePrActiveRuns and mounts the drawer only after that query settles (!isPending) → any new host of RunTraceDrawer must know running before mounting it, or a deep-linked ?trace= for a live run opens on the empty Trace tab
- 2026-09-22 — src/app/**/page.tsx: routes are async Server Components that await params/searchParams and pass typed props (parsePullsSearch, resolveTab) to a client <XxxView/>; URL state changes go through router.replace(<helper>Href(...)) and come back as new props, so no view reads useSearchParams and the root layout has no Suspense wrapper → keep new URL state in the page's searchParams; a leaf that must call useSearchParams needs its own <Suspense> (next build fails without it)
- 2026-09-22 — messages/en/prReview.json: the namespace is shared by the PR detail route, the /pulls list (list.*) and components/findings-hover (findingsHover.*); FindingCard/PromptBlock headers keep whole-row click via onClick that skips targets inside a/button (isFromInteractive) while a real <button aria-expanded> is the keyboard toggle → change only route-owned subkeys, and don't wrap a header that contains a link in one <button>
- 2026-09-22 — src/lib/hooks/run-events-store.ts: useRunEvents is backed by one ref-counted EventSource per run id (store per QueryClient); a stream ends on the server's terminal event (data.status done/failed/cancelled) or onerror, and then refreshes run-scoped PR queries → do not re-key the hook on the joined id list or reopen streams per render; adding a run must not restart the others
- 2026-09-22 — src/lib/hooks/keys.ts: every query key comes from the factories there (prKeys/repoKeys/agentKeys/settingsKeys/providerKeys/runKeys); PR-scoped keys nest under prKeys.detail(prId), and mutations own invalidation (useRunReview/useCancelRun refresh activeRuns+runs+reviews, useFindingAction(prId) is optimistic + always refetches reviews) → never write a key literal or invalidate from a page/component
- 2026-09-22 — src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab: the form draft holds only touched fields over the live agent from the query cache, and Save PUTs just the draft (server accepts partial patches; enabled-only changes do not bump the config version); AgentCard's enabled toggle writes the same cache → never copy server state into useState for this form or send the full object, or Save reverts changes made in the list
- 2026-09-22 — src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel: several ReviewRunAccordions can be open at once and each mounts a FindingsPanel with a window keydown listener; only the panel with active=true listens, and FindingsTab owns which review is active (default runs[0], handed over via onActivate on accordion open / pointerdown / focus inside the panel) → new keyboard shortcuts in a panel must be gated on that active prop, not added as another global listener
- 2026-09-21 — src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion: opening it renders FindingsPanel → useFindingAction/useDeleteReview (TanStack mutations), so a test that expands it fails with 'No QueryClient set' → wrap the render in <QueryClientProvider client={new QueryClient()}> instead of mocking single hooks

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->
- 2026-09-22 — vendor/shared/constants/feature-models.ts: FEATURE_MODELS (+ FEATURE_MODEL_IDS, PROVIDER_IDS) now live in a zod-free file that contracts/platform.ts re-exports; importing the subpath @devdigest/shared/constants/feature-models (tsconfig path + vitest alias both resolve it, no config change) cut /settings/[section] first-load JS 217 → 200 kB → for a runtime constant on a zod-free route, add it under vendor/shared/constants/ (both copies) instead of importing the barrel
- 2026-09-22 — src/app/repos/[repoId]/pulls/loading.tsx: a segment's loading.tsx is also the Suspense fallback for nested segments, so it shows while navigating to pulls/[number] too → keep it route-neutral (shell + skeleton rows) unless the child ships its own loading.tsx
- 2026-09-22 — src/lib/fonts.ts + app/globals.css: next/font emits hashed family names, but the vendored @devdigest/ui styles.css hard-codes "Inter"/"JetBrains Mono" on body, .mono and --font-mono → keep fonts wired through the --font-inter/--font-jetbrains-mono variables on <html> and the unlayered overrides in globals.css (they beat the vendored @theme layer); never go back to @font-face local()
- 2026-09-22 — client/next.config.mjs: runtime imports from @devdigest/shared work only via webpack resolve.extensionAlias {'.js': ['.ts','.tsx','.js']} (its barrel re-exports ./contracts/*.js); vitest resolves it without config. Importing any value pulls zod + every schema module into that route (/settings gained a ~57 KB minified chunk for FEATURE_MODELS) → import values only where the route already needs zod, otherwise use types
- 2026-09-21 — client vitest: a path filter with Next route brackets (`vitest run 'src/app/repos/[repoId]/...'`) is mangled into a pattern and reports 'No test files found' → filter by a plain substring of the file name instead (`npx vitest run FindingsPanel`)
- 2026-09-21 — client/.npmrc has node-linker=hoisted, so node_modules/.bin (tsc, vitest) is created only at the very END of pnpm install. A hung install (one stalled registry socket, no output for 10+ min) looks like a filled node_modules with no tsc → kill it and rerun `npx -y pnpm@10 install --frozen-lockfile --fetch-timeout 60000`; with the store warm it finishes in ~16s
- 2026-09-21 — design/DevDigest Design (standalone).html: screen sources (jsx mocks, e.g. CostBadge, ScreenDashboard grid) are gzip+base64 blobs in <script type="__bundler/manifest"> JSON (keys data/compressed), so plain grep finds nothing → decode with python (json.loads → b64decode → gzip.decompress) into the scratchpad, then grep the JS for exact columns and formats

## Recurring Errors & Fixes
<!-- error message → cause → fix -->
- 2026-09-22 — app/**/loading.tsx|page.tsx|not-found.tsx (server components): importing the @devdigest/ui barrel pulls recharts into the RSC graph → the route 500s at runtime with 'Super expression must either be null or a function', while tsc, vitest AND next build all stay green (seen on repos/[repoId]/pulls/loading.tsx) → route files that render @devdigest/ui directly need "use client" (or render a client View); check with: for f in $(grep -rl @devdigest/ui src/app --include=*.tsx); do grep -q '^"use client"' $f || echo $f; done
- 2026-09-22 — client next build: 'ENOENT … .next/server/pages-manifest.json' (Build error occurred) when two agents run next build in client/ at the same time — they share .next → check pgrep -af 'next build' and rerun after the other finishes; it is not a code error
- 2026-09-22 — React warning 'Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)': borderColor is itself a shorthand of the four side colors, so toggling it next to borderLeftColor warns (FindingCard focus ring) → set borderTopColor/RightColor/BottomColor + borderLeftColor, never borderColor
- 2026-09-22 — src/test/render.tsx: new URL('../..', import.meta.url) throws 'The URL must be of scheme file' under the jsdom environment (import.meta.url is not file:) → use __dirname (vite-node provides it) for fs paths in test helpers

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
