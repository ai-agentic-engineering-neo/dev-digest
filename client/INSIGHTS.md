# Insights — client

UI decisions and dead ends. Read before restructuring pages, state, or the data
layer.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.tsx:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

_None yet. Add the first one the next time a UI approach is tried and
abandoned — that is exactly what this file is for._

## What Works

_None yet._

## What Doesn't Work

- **2026-08-21** — `runs.flatMap((r) => r.findings)` on the PR detail page
  (`page.tsx`) aggregates findings across EVERY historical review run for
  the PR, not just the latest — and `FindingRecord.dismissed_at` was not
  filtered before deriving `lethalTrifecta` from it. Result: dismissing a
  confirmed-false-positive `lethal_trifecta` finding on one run left the
  "Lethal Trifecta detected" banner showing on every later (clean) run for
  the rest of the PR's life — dismissal looked like it did nothing. Any new
  aggregate derived from `allFindings` on this page (there's also
  `findingsCount` and the `DiffTab` findings prop, both still unfiltered)
  needs the same `dismissed_at === null` check considered explicitly, not
  assumed. `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:94-98`

## Codebase Patterns

- **2026-07-XX** — `messages/en/evalCases.json`'s `diffPlaceholder` (and
  `namePlaceholder: "stripe-key-leak"`) intentionally embed a synthetic
  `sk_live_xxx` string — it's example copy for the "New eval case" form,
  demonstrating the exact pattern the product's own secret-leakage eval case
  exists to detect. It is not a real credential. An AI reviewer may flag it
  as a "hardcoded secret"; don't rewrite the string to placate that — it
  would defeat the eval case's purpose. Dismiss the finding instead.
  `client/src/messages/en/evalCases.json`

- **2026-08-04** — Before adding a new hook/endpoint to show "more detail on
  X" in a component, check whether the detail is already fetched elsewhere on
  the same page and can be threaded down as a prop instead. `RunHistory` only
  ever received `RunSummary[]` (denormalized `critical_count`/`warning_count`/
  `suggestion_count`, no finding detail), but `FindingsTab` — its direct
  parent — already holds the full `ReviewRecord[]` (each with a `findings:
  FindingRecord[]` and `run_id`) via `usePrReviews`. Adding a hover preview of
  a run's findings needed only `new Map(runs.map(r => [r.run_id,
  r.findings]))` in `FindingsTab` passed down as `findingsByRun`, zero new
  API/hook. `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:75`

## Tool & Library Notes

- **2026-08-04** — This dev environment's seeded Postgres has zero
  `agent_runs` rows with `findings_count > 0` across all 3 seeded repos
  (`acme/payments-api`, `myasoid/dev-digest`, `quarkusio/quarkus`) — every
  seeded review is a clean 0-findings/100-score run. To visually verify any
  findings-related UI change, either trigger a real (costly) LLM review run,
  or temporarily `INSERT` rows into `findings` + bump the matching
  `agent_runs.critical_count`/`warning_count`/`suggestion_count`/
  `findings_count`, screenshot, then delete/revert immediately after —
  confirmed safe and fully reversible on the local dev DB
  (`postgres://devdigest:devdigest@localhost:5432/devdigest`). Separately, no
  `chromium-cli` or `agent-browser` CLI was present in this sandbox; `npx
  playwright install chromium` (no `--with-deps`, which needs sudo) downloads
  a working headless Chromium fine, so a scratch `npm install playwright` +
  a small driver script is the fallback for one-off browser verification here.

## Recurring Errors & Fixes

- **2026-08-18** — Adding a new clickable element that renders near an
  existing one sharing a generic word breaks `getByRole("button", { name:
  /finding/i })`-style loose-regex queries via "found multiple elements",
  not via a clear diff — the failure only shows up if a test fixture's data
  happens to make both render together. Making Smart Diff's per-line finding
  badges (`CodeLine.tsx`) real `<button>`s (previously inert `<span>`s) broke
  two *unrelated* existing tests this way: `FileCard.test.tsx` and
  `SmartDiffViewer.test.tsx` both had a `finding()` factory defaulting
  `start_line` to a value that matched a real rendered line in their patch
  fixture, so their `/finding/i` query — meant for the file-header aggregate
  badge — started matching the new per-line badge too. Fix: anchor such
  queries on the more specific accessible-name text unique to the target
  element (here, the header badge's `"— click to jump to it"` suffix) rather
  than a generic word likely to be reused by sibling UI. `client/src/components/diff-viewer/FileCard/FileCard.test.tsx`,
  `client/src/components/smart-diff-viewer/SmartDiffViewer/SmartDiffViewer.test.tsx`

- **2026-08-15** — Running `pnpm build` (production `next build`) in `client/`
  while a `pnpm dev` (`next dev`) server is already running against the same
  `.next/` directory corrupts the dev server's runtime: it starts throwing
  `Runtime Error: Cannot find module './vendor-chunks/next@…_@babel+core@…
  ...js'` on every page, even pages that predate the build and were working
  seconds earlier. `next build` and `next dev` must not share one `.next/`
  concurrently. Fix: kill the `next dev` process, `rm -rf client/.next`, and
  restart `pnpm dev` — a plain restart without clearing `.next` was not
  enough to recover in one instance of this.

- **2026-08-14** — `fireEvent.dragOver(el, { clientY: N })` never sets
  `clientY` on the event RTL dispatches: `@testing-library/dom`'s event map
  types `dragOver` as `DragEvent`, not `MouseEvent`, so the init dict's
  `clientY` is silently dropped and the handler reads `undefined`. Any
  before/after-drop-position logic keyed on `e.clientY` (e.g. comparing
  against `getBoundingClientRect().top + height / 2`) will always take the
  same branch in tests no matter what `clientY` you pass. Confirmed by
  logging `e.clientY` in a throwaway handler — `undefined`, `"undefined"`.
  Workaround: build the event by hand and dispatch it via the low-level
  `fireEvent(el, event)` overload — `Object.assign(new Event("dragover", {
  bubbles: true, cancelable: true }), { dataTransfer, clientY: -1 })` —
  which does propagate `clientY` since it's just an own property on a plain
  `Event`.
  `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx`

- **2026-08-04** — `fireEvent.mouseEnter` on a component whose hover-open
  logic uses `setTimeout` (e.g. an open delay to survive a mouse
  pass-through) needs `vi.useFakeTimers()` **and** the timer advance wrapped
  in `act()` from `@testing-library/react`:
  `act(() => { vi.advanceTimersByTime(150); })`. Without the `act()` wrapper,
  the state update from the timer callback doesn't flush before the
  assertion runs — `aria-expanded` stays `"false"` and the popover content is
  never found, even though the component logic is correct.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`

- **2026-08-01** — A vitest failure whose two sides look identical —
  `expected '9 119 tok' to be '9 119 tok'` — is a look-alike Unicode space, not
  an environment difference. `formatTokenCount` had a literal THIN SPACE
  (U+2009) typed into `.replace(/,/g, " ")`, invisible in the diff and in the
  test output. Dump code points first —
  `[...s].map((c) => c.charCodeAt(0).toString(16))` — before theorising about
  ICU or jsdom locale data, which is where this was initially misdiagnosed.
  Group digits with `.replace(/\B(?=(\d{3})+(?!\d))/g, " ")` rather than
  `toLocaleString` plus a separator swap, so the separator is a plain U+0020 a
  test can type. Find strays with `rg '\x{2009}' src/`.
  `client/src/lib/format.ts:40`

## Open Questions

_None yet._
