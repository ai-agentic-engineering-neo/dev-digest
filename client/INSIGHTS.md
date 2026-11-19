# client — insights

Append-only. Written via the `engineering-insights` skill (.claude/skills/engineering-insights). One insight per bullet.
Format: `- YYYY-MM-DD — <context/trigger> → <what to do instead> (evidence: path#symbol | command)`
Never edit or delete entries; correct with a new dated `supersedes …` entry.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and antipatterns, with why — the most valuable section -->

## Codebase Patterns
<!-- conventions and architecture decisions, with the reason -->
- 2026-11-19 — Iterating severity levels for UI (counters, filters) → use contract `Severity.options` from `@devdigest/shared` (CRITICAL/WARNING/SUGGESTION); UI-kit `SEV`/`Severity` and FindingsPanel `SEVERITY_ORDER` also carry `INFO`, which the contract never emits (evidence: src/vendor/ui/primitives/tokens.ts#SEV, src/vendor/shared/contracts/findings.ts#Severity)
- 2026-11-19 — `SeverityBadge` renders `LABEL count` with tinted bg → for `count LABEL` pill chips build from `SEV` tokens instead of changing the UI-kit primitive (evidence: src/vendor/ui/primitives/Badge.tsx#SeverityBadge)
- 2026-11-19 — supersedes the SEV-pill entry above: user wants the project's existing design, not mockup styling → interactive filters use the `Chip` primitive (`icon`/`color` from `SEV`, built-in `active` state) like the PR-list `FilterBar`; mockups define behaviour only, never hand-roll chip styles (evidence: src/vendor/ui/primitives/Chip.tsx#Chip, src/app/repos/[repoId]/pulls/_components/FilterBar/FilterBar.tsx)

## Tool & Library Notes
<!-- dependency / CLI quirks -->
- 2026-11-19 — Runtime value import from `@devdigest/shared` (e.g. `Severity.options`) → passes vitest + tsc but Next dev returns 500 "Module not found: Can't resolve './contracts/findings.js'" (webpack has no `.js`→`.ts` extensionAlias for src/vendor/shared) → in client code import only types from `@devdigest/shared`; build value lists as `Record<Severity, true>` literals so tsc still checks them; always open the page, tests don't catch it (supersedes the `Severity.options` advice in Codebase Patterns) (evidence: FindingsPanel/constants.ts#SEVERITY_LEVELS)
- 2026-11-19 — `vitest run "src/app/repos/[repoId]/…"` path filter → "No test files found" (brackets are treated as glob/regex, escaping doesn't help) → filter by a plain name fragment instead: `pnpm exec vitest run FindingsPanel` (evidence: client FindingsPanel tests)

## Recurring Errors & Fixes
<!-- error message → fix -->

## Session Notes
<!-- ### YYYY-MM-DD + 1–3 bullets: what was done, what was decided -->
### 2026-11-19
- M1 severity counters + filter shipped in FindingsPanel per specs/M1-severity-filter.md: `Chip` per level, zero-count levels hidden, counts taken after Hide low confidence, second click clears.
- First version broke the PR page (500) via a runtime `@devdigest/shared` import; only opening the page caught it.
- Known, left on purpose (user decision): the Next "1 Issue" badge is FindingCard's `borderColor` vs `borderLeftColor` React warning (FindingCard/styles.ts#card), not a filter bug.

## Open Questions
<!-- still unclear; move out once answered -->
