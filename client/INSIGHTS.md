# Insights — client

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

_No entries yet._

## What Doesn't Work

### The pre-implemented findings-column feature lives only in reverted commits — don't copy it (2026-09-18)

`git log` on `main` shows a fully working severity-chip PR-list column + hover popover + PR-detail severity pills, implemented in `7641b48`/`97b6edc`/`0953fdc`, then wiped by `c6af1e4` ("revert: restore main to the starter state, homework belongs in forks") — the full state still exists on `integration/all-features`. `git show`-ing those commits looks like a shortcut but is literally the graded solution; the revert commit message makes the intent explicit.

**Rule:** when a feature the homework asks for already has "finished-looking" commits in `git log`, check the surrounding history for a revert before reusing any of it — treat reverted work as a spec to satisfy independently, not a diff to reapply. (commit `c6af1e4`, reverted range `7641b48..0953fdc`)

## Codebase Patterns

### Severity-pill counts must be computed after hideLow, not before it (2026-09-18)

`FindingsPanel` has two independent filters (a "hide low confidence" toggle and, added this session, a severity pill filter). If the pill counts are derived from the *full* finding list while the visible cards are derived from `hideLow`-filtered findings, the two numbers disagree the moment hideLow is on — a pill can say "3" while only 1 matching card renders.

**Rule:** derive severity counts from `visibleFindings(findings, hideLow, null)` (hideLow applied, severity filter not), and derive the rendered list from `visibleFindings(findings, hideLow, severity)` — same base list, severity applied last. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:33-41`)

### The UI `Severity` type and the wire `Severity` contract disagree on `INFO` (2026-09-18)

`vendor/ui/primitives/tokens.ts:3` types `Severity` as `"CRITICAL" | "WARNING" | "SUGGESTION" | "INFO"`, but the Zod contract everything from the API actually returns (`vendor/shared/contracts/findings.ts:11`) only has the first three. A severity-pill row built off the UI type renders an always-empty INFO pill; iterating the Zod-contract type doesn't.

**Rule:** when building severity-keyed UI (pill rows, filters, counters), iterate the wire contract's `Severity` (3 values), not the UI kit's `Severity` token type (4 values) — the extra `INFO` case in the UI type has no producer. (`client/src/vendor/ui/primitives/tokens.ts:3`, `client/src/vendor/shared/contracts/findings.ts:11-12`)

## Tool & Library Notes

### `@testing-library/user-event` is not installed — use `fireEvent` (2026-09-18)

`client/package.json` only has `@testing-library/react` and `@testing-library/jest-dom`; every existing click-driven test in this package uses `fireEvent.click` from `@testing-library/react`, not `userEvent`. Importing `@testing-library/user-event` fails to resolve at test time.

**Rule:** grep for the existing test convention (`grep -rl fireEvent src`) before writing a new interaction test here — don't assume `userEvent` is available just because it's the RTL-recommended default elsewhere. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx`, `client/package.json`)

### A long-running `next dev` can go stale mid-session and serve unstyled pages (2026-09-18)

A `next dev` process left running from before this session (many file adds/edits happened under `src/app/` and `src/components/` while it stayed up) started 404-ing on `_next/static/css/app/layout.css` and several JS chunks — the page still rendered (200 on `/`) but with zero CSS, so it looked like the whole design system had vanished (plain serif text, no dark theme, no colors). Not a code regression: `pnpm typecheck`/`pnpm build`/tests were all green at the time.

**Rule:** if the running app suddenly looks unstyled after a session with many new files, check Network for 404s on `_next/static/css/...` before suspecting the CSS/Tailwind setup itself. Fix: kill the stale dev process, `rm -rf client/.next`, restart `pnpm dev`. (symptom reproduced via `mcp__Claude_Browser__read_network_requests`, fixed by clearing `client/.next`)

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
