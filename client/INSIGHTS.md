# client — INSIGHTS

Append-only engineering insights for `client/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] Mounting the whole `/showcase` gallery in the smoke test catches any broken export or render in `@devdigest/ui` without per-component tests. Evidence: `client/src/test/smoke.test.tsx`.
- [2026-09-25] A colocated component test that renders `PRRow` needs only `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))` plus `NextIntlClientProvider` with the `prReview` messages; messages import path from `pulls/_components/<X>/` is seven `../` deep. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`.

## What Doesn't Work

- [2026-09-25] Sending `content-type: application/json` on a body-less POST or PUT. Fastify rejects it with "Body cannot be empty". `apiFetch` sets the header only when a body exists. Evidence: `client/src/lib/api.ts:30`.
- [2026-09-25] Editing `src/vendor/shared` directly. It is a copy of `server/src/vendor/shared` and has already drifted; edit the server copy and sync. Evidence: `client/src/vendor/shared/index.ts`.
- [2026-09-25] Rendering a hover popover with `position: absolute` inside a PR-list row: the table card (`s.tableCard`) has `overflow: hidden` and clips it to a thin strip. Anchor it with `position: fixed` from the cell's `getBoundingClientRect()` instead. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:findingsAnchor`.

## Codebase Patterns

- [2026-09-25] Query errors toast only on network failure or 5xx; 4xx stays silent so views render inline empty states. Mutations always toast. Evidence: `client/src/lib/providers.tsx:38`.
- [2026-09-25] Route files are thin; all logic lives in colocated `_components/<Name>/` with `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`, and `*.test.tsx`. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/`.
- [2026-09-25] Styles are inline `CSSProperties` objects keyed off CSS variables; theme switching is the `data-theme` attribute. Tailwind is installed but the UI kit does not use per-component stylesheets. Evidence: `client/src/lib/theme.tsx:18`.
- [2026-09-25] `/` redirects to the first repo's PR list, so with several repos in the dev DB the landing page is whichever sorts first. Evidence: `client/src/app/page.tsx:17`.
- [2026-09-25] Cost formatting threshold is `0.10`, not `0.01`: two decimals from ten cents up, two significant digits below (`$0.06`, `$0.012`, `$0.0013`). A `0.01` cut-off rendered the design's `$0.012` as `$0.01`. Evidence: `client/src/lib/format-cost.ts:formatCost`.
- [2026-09-25] ESLint runs `eslint-plugin-react-hooks` recommended rules but `react-hooks/set-state-in-effect` is switched off in `eslint.config.mjs`: six existing hydration-safe effects (theme, active repo, editor state, mermaid) set state on mount by design. Rejected: refactoring them to `useSyncExternalStore` just to satisfy lint. Evidence: `client/eslint.config.mjs:set-state-in-effect`.

## Tool & Library Notes

- [2026-09-25] `NEXT_PUBLIC_API_BASE` is the only env the client reads; default `http://localhost:3001`. Evidence: `client/src/lib/api.ts`.
- [2026-09-25] In RTL assertions a `SeverityBadge` with a count reads as label immediately followed by the number (`toHaveTextContent("Critical2")`): the count sits in a sibling span with no whitespace text node. Evidence: `client/src/vendor/ui/primitives/Badge.tsx:SeverityBadge`.

## Recurring Errors & Fixes


## Session Notes

- [2026-09-25] Initial capture from a read-through of the starter. No code changed. Evidence: `client/CLAUDE.md`.
- [2026-09-25] L01 run cost badge: `RunCostBadge` (compact/full) in `src/components/run-cost-badge`, `lib/format-cost.ts`, wired into PR list COST column, timeline, review-run header, trace drawer COST stat; showcase group; 39 client tests green. Evidence: `client/specs/run-cost-badge.md`.
- [2026-09-25] HW1 criteria pass (in progress): FINDINGS column + hover popover on the PR list, severity pills + filter chips in FindingsPanel, severity icons on timeline tiles, Dismiss relabelled Reject, ESLint flat config added (react-hooks plugin still missing); docs/ui-architecture.md + specs/pages.md written by a subagent, columns table still lacks the Findings row. Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx`.

## Open Questions

- [2026-09-25] Should the shared contracts copy be replaced by a path alias into `server/src/vendor/shared`, as reviewer-core already does, to stop the drift? Evidence: `reviewer-core/tsconfig.json:paths`.
