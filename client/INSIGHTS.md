# INSIGHTS — client
Lessons learned while working in this package (by humans or agents).
Maintained via the engineering-insights skill (.claude/skills/engineering-insights) — read it
before work, add only verified non-obvious lessons after. Newest first within a section.
Keep each entry ≤5 lines. Agents only append; changing, moving to CLAUDE.md or deleting existing entries needs the user's OK.

<!-- Entry format:
### YYYY-MM-DD — short title
- What: specific fact / symptom / error text
- Why: cause or rationale
- Rule: what to do next time
- Evidence: path/file.ts:42 · command · commit
- Also in: <other-pkg>/INSIGHTS.md   (cross-package only)
-->

## What Works
<!-- Approaches that proved themselves, ideally after an alternative failed -->

## What Doesn't Work
<!-- Failed approaches / anti-patterns, with the reason -->

## Codebase Patterns
<!-- Non-obvious conventions or decisions with rationale, not already in CLAUDE.md -->

### 2026-09-22 — a popover inside the PR-list table must be portalled to <body>
- What: `s.tableCard` sets `overflow: "hidden"` for its rounded corners, so any panel rendered inside a row is clipped at the table edge; the kit `Dropdown` hits the same wall (it is `position: absolute` and click-triggered).
- Why: verified in Chrome — the portalled card paints at y≈12 while the table starts at y≈160, which a descendant of an `overflow: hidden` box cannot do.
- Rule: `createPortal(node, document.body)` + `position: fixed` from `getBoundingClientRect()`, and close on scroll/resize — see toast.tsx / kit/Drawer.tsx for the same pattern.
- Evidence: src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsHoverCard.tsx · styles.ts `tableCard`

## Tool & Library Notes
<!-- Quirks of dependencies and tools -->

### 2026-09-22 — `useRouter: () => ({ push: vi.fn() })` makes navigation unassertable
- What: that next/navigation mock hands out a FRESH spy per `useRouter()` call, so `expect(push).toHaveBeenCalledWith(...)` always sees 0 calls — the test can only prove a click didn't throw.
- Why: the factory runs per call, not per module; the spy the test holds is never the one the component used.
- Rule: hoist one stable spy — `const push = vi.hoisted(() => vi.fn())` + `beforeEach(push.mockClear)` — whenever a test asserts where a click navigates.
- Evidence: src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx (click reaches the row)

## Recurring Errors & Fixes
<!-- Exact error text → cause → fix -->

## Open Questions
<!-- Unresolved; What + Evidence only; delete once answered -->
