# Insights — client

Non-obvious lessons from working in this package, captured by the `engineering-insights` skill.
Read before a non-trivial change and treat as high-confidence guidance unless told otherwise.
Append-only: add a bullet at the end of a section, never rewrite old ones — a newer entry marks
itself `(supersedes YYYY-MM-DD entry)`. Humans prune periodically.

Entry (every bullet, incl. Session Notes / Open Questions — date AND `path:line` are mandatory):
`- **YYYY-MM-DD** · <what is true> → <what to do> · \`path/from/repo-root.ts:42\``

## What Works
- **2026-09-17** · The PR list table card has `overflow: hidden`, so an absolutely positioned hover panel in a row gets clipped → render popovers via `createPortal` to `document.body` with `position: fixed` from the trigger's rect (see `FindingsPopover`) · `client/src/components/finding-severity/FindingsPopover.tsx:131`

## What Doesn't Work
- **2026-09-17** · Flattening a finding's markdown rationale by stripping `[`*_#>]` mangles identifiers (`sk_live_` → `sklive`) → strip only backticks, `**` and leading `#`/`>` · `client/src/components/finding-severity/FindingPreview.tsx:18`
- **2026-09-17** · Closing a fixed popover on `window` `scroll` in capture phase also fires for scrolls INSIDE the panel, so it closes as soon as the user scrolls its list → ignore events whose target is inside the panel (guard `target instanceof Node` — a window target makes `contains` throw) and add `overscrollBehavior: contain` · `client/src/components/finding-severity/FindingsPopover.tsx:86`
- **2026-09-17** · `borderColor` / `borderWidth` are shorthands in React's eyes, so pairing them with `borderLeftColor` still triggers "Updating a style property during rerender … conflicting property" once the value flips (FindingCard focus changes on severity filter) → spell out all four `border{Top,Right,Bottom,Left}{Color,Width}` · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:7`

## Codebase Patterns
- **2026-09-16** · Unknown run cost must render "—", never "$0.00" (0 reads as free) → use `formatCost` / `RunCostBadge`, which map null/undefined to a dash · `client/src/lib/format-cost.ts:8`
- **2026-09-17** · React portal events still bubble through the React tree, so a click inside a portaled popover triggers `PRRow`'s `router.push` / the timeline row's handlers → call `stopPropagation` on both the trigger and the panel (`onClick`, `onMouseDown`) · `client/src/components/finding-severity/FindingsPopover.tsx:110`

## Tool & Library Notes
- **2026-09-16** · `messages/en/runs.json` has a hand-indented key (`"copied"`); rewriting the file via a JSON load/dump re-indents it and leaves an unrelated diff hunk → add i18n keys with a targeted text edit, then check `git diff messages/` for stray changes · `client/messages/en/runs.json:71`
- **2026-09-17** · `eslint-plugin-react-hooks` 7.x `recommended` bundles React-Compiler rules; `react-hooks/set-state-in-effect` flags 8 pre-existing sync-in-effect sites (theme, repo-context, command palette…) as errors → keep it at `warn` in `eslint.config.mjs`; fix a site only when you touch that component · `client/eslint.config.mjs:21`
- **2026-09-17** · The rtk hook rewrites `npx eslint …` into a summary, so `-f json | python` gets non-JSON and fails → call `./node_modules/.bin/eslint . -f json -o <file>` and read the file · `client/package.json:9`

## Recurring Errors & Fixes

## Session Notes
- **2026-09-16** · Run cost badge on PR list, timeline and trace drawer (spec `specs/001-run-cost-badge.md`); added 1 entry above · `client/specs/001-run-cost-badge.md:1`
- **2026-09-16** · Wrap-up: added 1 Tool & Library note (i18n JSON rewrite reformat) · `client/messages/en/runs.json:71`
- **2026-09-17** · Findings by severity: pills + filter in run cards, timeline icons + popover, PR list FINDINGS column (spec `specs/002-findings-severity.md`); added 3 entries above · `client/specs/002-findings-severity.md:1`
- **2026-09-17** · Findings fixes: list popover per-agent scope, popover scroll, preview layout, severity icons in Review runs header; added 1 entry above · `client/src/components/finding-severity/FindingsPopover.tsx:1`
- **2026-09-17** · ESLint 9 flat config + `lint` script + CI step; one-off normalization of all entries to the mandatory `path:line` format (now fixed in the skill); added 2 entries above · `client/eslint.config.mjs:1`
- **2026-09-20** · Wrote `docs/{README,overview,structure,patterns}.md` and the pointer lines in `CLAUDE.md`; no new entries · `client/docs/README.md:1`

## Open Questions
