# client — engineering insights

Append-only log of non-obvious findings, written by agents via the
`engineering-insights` skill. Newest entries at the bottom of each section.
Review and prune periodically; stale entries are harmful.

## Non-obvious dependencies

- **2026-11-28** · `@devdigest/shared` resolves to the client's OWN vendored copy, not the server's; a new API field (e.g. `last_run_cost_usd`) must be added to `client/src/vendor/shared/contracts/*` too, or `PrMeta` silently lacks it and the UI never renders it — evidence: `client/tsconfig.json:24`, `client/src/vendor/shared/contracts/platform.ts:177`
  The two copies already differ in comments; diff them (`diff -r server/src/vendor/shared client/src/vendor/shared`) before editing.
- **2026-11-28** · Adding a PR list column needs THREE coordinated edits: a new width in `GRID` (shared by header and rows), a key in `COLUMN_KEYS` at the same index as the new cell in `PRRow`, and `list.columns.<key>` in `prReview.json`; a mismatch shifts every column silently (no test catches it) — evidence: `client/src/app/repos/[repoId]/pulls/constants.ts:27`, `client/src/app/repos/[repoId]/pulls/constants.ts:42`

## Fixes & gotchas

- **2026-11-28** · `pnpm exec vitest run "src/app/repos/[repoId]/..."` finds no tests: vitest treats the path filter as a pattern and the `[repoId]` brackets break it; filter by a plain substring instead (`pnpm exec vitest run PRRow`) — evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx:1`
- **2026-11-28** · `Badge` from `@devdigest/ui` has no `title`/`aria-*`/`data-*` props, so tooltips and test ids must go on a wrapping `<span>` — evidence: `client/src/vendor/ui/primitives/Badge.tsx:5`, `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:36`
- **2026-11-28** · Components that call `useRouter()` (e.g. `PRRow`) crash in jsdom unless the test mocks `next/navigation`; copy the `vi.mock("next/navigation", …)` pattern — evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx:13`
- **2026-11-28** · Trace drawer `Stat` renders label and value as sibling divs with no test id; assert a stat with `getByText("COST").nextElementSibling` (labels come upper-case from `runs.json`) — evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:54`

## Measured facts

- **2026-11-28** · Full client suite: 13 files / 38 tests in ~6.5 s (`cd client && pnpm test`), typecheck ~10 s; no Docker or API needed — evidence: `client/vitest.config.ts:1`
- **2026-11-28** · Client suite after the 3-screen cost feature: 15 files / 53 tests in ~7.3 s (`cd client && pnpm test`) — evidence: `client/vitest.config.ts:1`

## Surprises

- **2026-11-28** · Review runs on flash-class models cost fractions of a cent, so `toFixed(2)` would render every badge as `$0.00`; `formatUsd` keeps 4 decimals below one cent — evidence: `client/src/lib/format-usd.ts:5`
