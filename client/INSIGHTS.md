# Insights — client

Running log of non-obvious things learned while working in `@devdigest/web`:
gotchas, dead ends, decisions that don't belong in the fixed map in
[`CLAUDE.md`](CLAUDE.md). Newest entries at top.

<!-- Add entries below, e.g.:
## 2026-09-15 — short title
What happened, what was tried, what actually worked or didn't, and why.
-->

## 2026-09-20 — `z.number().default(0)` makes a contract field required, not optional, at the type level [Context]
`Agent.skills_count` and `Skill.agents_count` in `client/src/vendor/shared/contracts/knowledge.ts:132,197`
are declared `z.number().int().default(0)`. `.default()` only makes a field
optional on the schema's *input* (parse) side — the inferred TS type
(`z.infer<typeof Agent>`) still marks it non-optional, since a parsed value
always has it. Any object literal typed as `Agent`/`Skill` (test fixtures,
mock data) that predates this field now fails `tsc --noEmit` with "Property
'skills_count' is missing" even though at runtime `Schema.parse({})` would
happily fill in `0`. Pre-existing fixtures in `AgentEditor.test.tsx:18` and
`AgentCard.test.tsx:11` broke this way when another workstream added the
field — vitest itself still ran fine (no type-checking in the test
transform), only `pnpm typecheck` caught it. Takeaway: adding a `.default()`
field to a widely-fixture'd contract is not typecheck-safe without also
updating every existing literal of that type; grep for `: Agent = {` /
`: Skill = {`-style literals before landing the schema change.

## 2026-09-19 — one filter value drove two different scopes [Mistake]
`FindingsTab`'s `severityFilter` was passed to two places at once: down into
`ReviewRunAccordion` (correctly filters that run's own findings) and into a
local `visibleRuns = runs.filter(r => r.findings.some(f => f.severity ===
severityFilter))` that decided which run *cards* to render at all. Clicking
a severity chip therefore both filtered findings within a run **and** hid
entire run cards that had zero findings at that severity — a run with other,
non-matching findings vanished from the list instead of just showing 0
findings. Fix: delete the list-visibility filter entirely and always render
`runs` (`FindingsTab.tsx:167`); let the per-card `severityFilter` prop
passed into `SeverityCounters` (`FindingsTab.tsx:155`, already correct) be
the only consumer. Lesson: when a filter value is threaded through props
into a child that does its own filtering, don't *also* use that same value
to decide list membership one level up — pick one owner for "is this item
shown at all" vs. "what does this item show internally."

## 2026-09-16 — hover popovers on the PR list must use a portal [Context]
`pulls/styles.ts:86`'s `tableCard` has `overflow: hidden` (to clip the
table's rounded corners), which silently clips any normal
absolutely-positioned child that extends past a row — a hover-preview
popover (`FindingsCell`) rendered this way was invisible even though it
mounted correctly (confirmed via DOM/text queries) and had no console
errors. Fix: render it via `ReactDOM.createPortal(..., document.body)`
(`FindingsCell.tsx:99`) with `position: fixed` computed from the trigger's
`getBoundingClientRect()` at hover-open time, not as a normal child.
Anything else added to this page that needs to visually escape its row
(tooltips, dropdowns taller than the row) will hit the same clipping and
needs the same portal treatment.

## 2026-09-16 — `pnpm build` corrupts a concurrently-running `pnpm dev` [Mistake]
Process/tooling gotcha, not tied to a single source line (no code change
involved — see `client/package.json`'s `dev`/`build` scripts for the two
commands in question). Ran `pnpm build` (production `next build`) to sanity-check a change while a
`pnpm dev` server was already up on :3000 (started earlier by `scripts/dev.sh`).
Both commands write into the same `.next/` directory; afterward the dev server
500'd on every route with `Cannot find module './vendor-chunks/recharts@....js'`
— the dev runtime's chunk manifest had been overwritten mid-flight. Fix: kill
the port's listener (`lsof -ti:3000 -sTCP:LISTEN | xargs kill`), `rm -rf .next`,
restart `pnpm dev`. Takeaway: never run `pnpm build` against a `client/` that
already has a dev server running on the same checkout — use `pnpm typecheck`
(safe, no shared build output) for a quick sanity check instead, and only run
`pnpm build` if the dev server is stopped first (or in a separate worktree).
