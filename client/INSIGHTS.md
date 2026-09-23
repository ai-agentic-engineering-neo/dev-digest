# client — insights

Things that are true about `client/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).
Agents write here only through the `engineering-insights` skill, whose script
inserts lines and never changes existing ones.

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## What works

## What doesn't work

- **2026-09-23** — `src/vendor/shared/` has drifted from the canonical server
  copy: 5 files differ, and the server is ahead in each (`openrouter` provider
  values, `AgentManifest`, `CommitFile`, …). There is no sync script. Evidence:
  `diff -rq server/src/vendor/shared client/src/vendor/shared`.
- **2026-09-23** — `FindingsPanel`'s j/k/a/d shortcuts are a `window` keydown listener per panel instance, and every expanded Review run mounts its own panel → with two runs open, one `a` or `d` press accepts/rejects the focused finding in each of them (read from the code, not reproduced) → keep one run expanded when using the shortcuts; scoping the listener to the focused panel is the fix. Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:55-59`, `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:175`.

## Codebase patterns

- **2026-09-23** — The PR list's filter is the `?status=` URL param and
  defaults to `needs_review`, so a PR drops out of the default view as soon as it
  is reviewed (clicking "All" from a script did not stick) → open
  `/repos/:id/pulls?status=all` to check list columns in screenshots or e2e.
  Evidence: `src/app/repos/[repoId]/pulls/page.tsx:39`.
- **2026-09-23** — The two "blockers" on the PR page can disagree. The Timeline's
  `RunSummary.blockers` is fixed when the run finishes and counted against the
  agent's `ciFailOn` gate. The Review-run header counts CRITICAL minus dismissed,
  live. → never treat them as one number; per-run severity data comes from
  `ReviewRecord.findings`. Evidence: `../server/src/modules/reviews/run-executor.ts:240`,
  `src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:57`.
- **2026-09-23** — `@devdigest/ui` has no popover, tooltip or hover card; its one
  overlay, `Dropdown`, is click-driven and absolutely positioned inside its
  wrapper. The PR list's `tableCard` has `overflow: hidden`, which would clip such
  an overlay in lower rows → build hover cards with a portal and `position: fixed`,
  and stop click propagation (React bubbles portal events to the row's `onClick`).
  Evidence: `src/vendor/ui/kit/Dropdown.tsx:83-88`,
  `src/app/repos/[repoId]/pulls/styles.ts:91`, `server/specs/02-findings-by-severity.md`.
- **2026-09-23** — Review-run finding cards say **Reject** / `rejected` only in copy (HW1 criterion 22); the API action, the `d` shortcut, `FindingActionKind` and `dismissed_at` all keep `dismiss` → grep `dismiss` in code and `Reject` only in `messages/en/prReview.json`; don't rename the API. Evidence: `messages/en/prReview.json:7`, `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:110`.

## Tool & library notes

- **2026-09-23** — `pnpm exec vitest run <path>` finds nothing when the path
  has a Next.js segment like `[repoId]`, escaped or not ("No test files
  found") → filter by a filename substring: `pnpm exec vitest run RunHistory.test`.
  Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`.
- **2026-09-23** — `Chip` from `@devdigest/ui` renders a plain `<button>` with no `aria-pressed`, so a toggle-filter's active state is visual only and the vendored kit can't be edited → in tests, assert a filter through the cards it leaves (`[data-finding-id]`), not through the button's state. Evidence: `src/vendor/ui/primitives/Chip.tsx:22`, `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`.

## Recurring errors & fixes

## Doc drift

- **2026-09-23** — README and TESTING say client tests mock `fetch`; the setup
  file only loads jest-dom and stubs `ResizeObserver`. Tests mock the hooks
  module instead. Evidence: `README.md:17,46`, `../TESTING.md:38`,
  `src/test/setup.ts`.
- **2026-09-23** — `src/vendor/ui/README.md` points at a `/showcase` route that
  does not exist; only the smoke test renders the gallery. Evidence:
  `src/vendor/ui/README.md:55`, `ls src/app`.
- **2026-09-23** — `RunHistory`'s header comment says "clicking a run row opens
  its trace", but the row `<div>` has no `onClick`: only the 📄 icon opens the
  drawer, and the agent name jumps to Review runs. The user confirmed icon-only
  is intended → don't add row clicks. Evidence:
  `src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:13,154,209`.

## Session notes

- **2026-09-23** — Run Cost Badge (lab task 3): +2 (Tool & library notes, Codebase patterns)
- **2026-09-23** — Findings-by-severity spec + plan: +3 (Doc drift, Codebase patterns)
- **2026-09-23** — HW1 fixes, block A (popover header, Reject, Timeline cost): +1 (Codebase patterns)
- **2026-09-23** — HW1 fixes, block B (Review-run severity pills + filter): +2 (What doesn't work, Tool & library notes)

## Open questions

- **2026-09-23** — Some copy is hardcoded despite next-intl (onboarding page,
  root empty state), and e2e flows assert on it. Move it to `messages/en/` or
  leave it? Evidence: `src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94`,
  `src/app/page.tsx:34`.
