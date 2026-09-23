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

## Codebase patterns

- **2026-09-23** — The PR list's filter is the `?status=` URL param and
  defaults to `needs_review`, so a PR drops out of the default view as soon as it
  is reviewed (clicking "All" from a script did not stick) → open
  `/repos/:id/pulls?status=all` to check list columns in screenshots or e2e.
  Evidence: `src/app/repos/[repoId]/pulls/page.tsx:39`.

## Tool & library notes

- **2026-09-23** — `pnpm exec vitest run <path>` finds nothing when the path
  has a Next.js segment like `[repoId]`, escaped or not ("No test files
  found") → filter by a filename substring: `pnpm exec vitest run RunHistory.test`.
  Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`.

## Recurring errors & fixes

## Doc drift

- **2026-09-23** — README and TESTING say client tests mock `fetch`; the setup
  file only loads jest-dom and stubs `ResizeObserver`. Tests mock the hooks
  module instead. Evidence: `README.md:17,46`, `../TESTING.md:38`,
  `src/test/setup.ts`.
- **2026-09-23** — `src/vendor/ui/README.md` points at a `/showcase` route that
  does not exist; only the smoke test renders the gallery. Evidence:
  `src/vendor/ui/README.md:55`, `ls src/app`.

## Session notes

- **2026-09-23** — Run Cost Badge (lab task 3): +2 (Tool & library notes, Codebase patterns)

## Open questions

- **2026-09-23** — Some copy is hardcoded despite next-intl (onboarding page,
  root empty state), and e2e flows assert on it. Move it to `messages/en/` or
  leave it? Evidence: `src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94`,
  `src/app/page.tsx:34`.
