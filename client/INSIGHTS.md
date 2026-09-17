# Insights — client

Running log of non-obvious things learned while working in `@devdigest/web`:
gotchas, dead ends, decisions that don't belong in the fixed map in
[`CLAUDE.md`](CLAUDE.md). Newest entries at top.

<!-- Add entries below, e.g.:
## 2026-09-15 — short title
What happened, what was tried, what actually worked or didn't, and why.
-->

## 2026-09-16 — hover popovers on the PR list must use a portal [Context]
`pulls/styles.ts`'s `tableCard` has `overflow: hidden` (to clip the table's
rounded corners), which silently clips any normal absolutely-positioned
child that extends past a row — a hover-preview popover (`FindingsCell`)
rendered this way was invisible even though it mounted correctly (confirmed
via DOM/text queries) and had no console errors. Fix: render it via
`ReactDOM.createPortal(..., document.body)` with `position: fixed` computed
from the trigger's `getBoundingClientRect()` at hover-open time, not as a
normal child. Anything else added to this page that needs to visually
escape its row (tooltips, dropdowns taller than the row) will hit the same
clipping and needs the same portal treatment.

## 2026-09-16 — `pnpm build` corrupts a concurrently-running `pnpm dev` [Mistake]
Ran `pnpm build` (production `next build`) to sanity-check a change while a
`pnpm dev` server was already up on :3000 (started earlier by `scripts/dev.sh`).
Both commands write into the same `.next/` directory; afterward the dev server
500'd on every route with `Cannot find module './vendor-chunks/recharts@....js'`
— the dev runtime's chunk manifest had been overwritten mid-flight. Fix: kill
the port's listener (`lsof -ti:3000 -sTCP:LISTEN | xargs kill`), `rm -rf .next`,
restart `pnpm dev`. Takeaway: never run `pnpm build` against a `client/` that
already has a dev server running on the same checkout — use `pnpm typecheck`
(safe, no shared build output) for a quick sanity check instead, and only run
`pnpm build` if the dev server is stopped first (or in a separate worktree).
