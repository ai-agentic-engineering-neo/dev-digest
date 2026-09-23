# client — insights

Things that are true about `client/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## Decisions

## Pitfalls

- **2026-09-23** — `src/vendor/shared/` has drifted from the canonical server
  copy: 5 files differ, and the server is ahead in each (`openrouter` provider
  values, `AgentManifest`, `CommitFile`, …). There is no sync script. Evidence:
  `diff -rq server/src/vendor/shared client/src/vendor/shared`.

## Doc drift

- **2026-09-23** — README and TESTING say client tests mock `fetch`; the setup
  file only loads jest-dom and stubs `ResizeObserver`. Tests mock the hooks
  module instead. Evidence: `README.md:17,46`, `../TESTING.md:38`,
  `src/test/setup.ts`.
- **2026-09-23** — `src/vendor/ui/README.md` points at a `/showcase` route that
  does not exist; only the smoke test renders the gallery. Evidence:
  `src/vendor/ui/README.md:55`, `ls src/app`.

## Open questions

- **2026-09-23** — Some copy is hardcoded despite next-intl (onboarding page,
  root empty state), and e2e flows assert on it. Move it to `messages/en/` or
  leave it? Evidence: `src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94`,
  `src/app/page.tsx:34`.
