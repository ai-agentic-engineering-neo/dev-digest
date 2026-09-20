# Insights — client

Lessons an agent cannot guess from the code alone. Read this before starting work in
this module; append to it at wrap-up, but only when something non-obvious came up.
Append-only — correct an entry with a dated note beneath it, never by rewriting it.
See `.claude/skills/engineering-insights/`.

## What Works

### `resolve.extensionAlias` unlocks runtime (Zod) imports from `@devdigest/shared` (2026-09-20)

`vendor/shared/index.ts` re-exports `./contracts/*.js` while the files on disk are `.ts`, which webpack could not resolve. The deleted `lib/feature-models.ts` recorded this as a hard limit ("the client can only import TYPES... so we mirror the registry here") and hand-copied `FEATURE_MODELS` because of it. It is not a limit: four lines of `webpack.resolve.extensionAlias` in `next.config.mjs` fix it, after which schemas can be `.parse`d in the browser — proven by running `FeatureModelId.safeParse()` in a live page, not just by typecheck.

**Rule:** never mirror a runtime value from `vendor/shared` into the client "because only types can cross". Import it. If a `.js`-specifier resolution error appears, check that the `extensionAlias` block in `next.config.mjs` is still there — removing it breaks every runtime import from the shared package at once. (`client/next.config.mjs:11-18`, commit `17d49fa`)

## What Doesn't Work

### The pre-implemented findings-column feature lives only in reverted commits — don't copy it (2026-09-18)

`git log` on `main` shows a fully working severity-chip PR-list column + hover popover + PR-detail severity pills, implemented in `7641b48`/`97b6edc`/`0953fdc`, then wiped by `c6af1e4` ("revert: restore main to the starter state, homework belongs in forks") — the full state still exists on `integration/all-features`. `git show`-ing those commits looks like a shortcut but is literally the graded solution; the revert commit message makes the intent explicit.

**Rule:** when a feature the homework asks for already has "finished-looking" commits in `git log`, check the surrounding history for a revert before reusing any of it — treat reverted work as a spec to satisfy independently, not a diff to reapply. (commit `c6af1e4`, reverted range `7641b48..0953fdc`)

### Page-level state published into a layout-level context must not clear itself unconditionally (2026-09-20)

`AppShell` moved into the `(shell)` layout, so pages publish breadcrumbs through a context instead of passing props. The first `ShellCrumb` cleared the trail in its effect cleanup (`return () => setCrumb([])`), which is the obvious way to avoid a stale crumb. On navigation React mounts the incoming page's effect BEFORE running the outgoing page's cleanup, so the old page wiped the crumbs the new page had just set and the shell rendered blank. Intermittent by route, and invisible to the suite: `pnpm typecheck`, 86 tests and `pnpm build` were all green with the bug in place — only clicking through the app in the browser showed it.

**Rule:** when a child publishes state upward into a longer-lived provider, make the cleanup conditional on still owning the value (`setX(prev => prev === mine ? empty : prev)`), and verify it by navigating between at least three routes in the browser — this class of bug never reaches a component test. (`client/src/components/app-shell/crumb-context.tsx:37-45`, commit `f1fa550`)

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

### `pnpm build` while `next dev` is running poisons `.next` — and the browser tab keeps the corpse (2026-09-20)

Same `.next` directory, two writers: every `pnpm build` run for verification made the live dev server start throwing `Cannot find module './vendor-chunks/…'` and 500 on every route. This happened four times in one session because `build` is part of the done-criteria for most steps. Worse is the aftermath: after killing the server, clearing `.next` and restarting, the OLD browser tab still 404s on chunk URLs from the dead process and the browser console keeps replaying pre-restart errors, so a healthy app looks broken. The last round cost ~15 minutes of chasing a "regression" that did not exist — the dev-server log showed clean 200s the whole time. Related to the stale-`next dev` entry above, but a different cause: concurrent writers, not accumulated edits.

**Rule:** run `pnpm build` only when the preview server is stopped; if you ran it anyway, `rm -rf client/.next` and restart. After any restart, verify in a NEW tab (`tabs_create`) — an existing tab's JS and its console buffer both belong to the dead process. Trust `preview_logs` over the browser console when they disagree. (symptom: `Cannot find module './156.js'`; dev-server log showed `✓ Compiled` + 200s at the same moment)

## Recurring Errors & Fixes

### React dev warning: `borderColor` + `borderLeftColor` still "conflict" even without the `border` shorthand (2026-09-18)

`FindingCard/styles.ts`'s `card()` already avoided the classic mistake (mixing the `border` shorthand with `borderLeft*`) — its own comment says so — but still paired `borderColor` with `borderLeftColor` and hit React's "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" warning on every focus-state rerender. `borderColor` in React's `CSSProperties` maps to CSS `border-color`, which is itself a shorthand for all four sides — so it still overlaps `borderLeftColor` on the left edge. Being "already longhand" isn't enough; it has to be longhand on the *same axis* as the property you're overriding.

**Rule:** when one side of a border needs an independent color from the rest, never use `borderColor` (all-sides shorthand) — split it into `borderTopColor`/`borderRightColor`/`borderBottomColor` explicitly, alongside the one-side longhand (`borderLeftColor` here). Verify by clicking/rerendering the focused state and checking DevTools console, not just by not-seeing red text on first paint. (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5-19`)

## Session Notes

_No entries yet._

## Open Questions

### MermaidDiagram видалено як мертвий код — повернути разом з onboarding-туром (2026-09-20)

`client/src/components/mermaid-diagram/` і залежність `mermaid` прибрані на кроці 8
рефакторингу, бо на компонент не було жодного імпорту. Але фіча, під яку він робився,
жива в контрактах: `OnboardingSection.diagram` (`vendor/shared/contracts/knowledge.ts:39`,
поле в mermaid-синтаксисі), промпт `server/src/prompts/onboarding.system.md` (правила
"Mermaid rules (so it renders — invalid diagrams are dropped)") і запис `onboarding`
у Feature Models. UI туру в стартері немає — `app/onboarding/` це екран додавання репо.

**Правило:** коли з'явиться екран onboarding-туру, не пиши обгортку заново:
`git checkout "$(git rev-list -1 HEAD -- client/src/components/mermaid-diagram)^" -- client/src/components/mermaid-diagram`
і `cd client && pnpm add mermaid` (не редагуй lockfile руками). За
`frontend-ui-architecture` це адаптер над сторонньою бібліотекою: клади його поруч
з єдиним споживачем — екраном туру, а не назад у `src/components/`.
