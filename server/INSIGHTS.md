# server — insights

Things that are true about `server/` but not visible in the code. Append-only:
when an entry goes stale, add a dated note under it instead of deleting it.
Cross-package findings go in the [root file](../INSIGHTS.md).

Entry format: `- **YYYY-MM-DD** — claim. Evidence: \`path:line\``

## Decisions

## Pitfalls

## Doc drift

- **2026-09-23** — README says handlers "no longer hand-roll
  `Schema.parse(req.body)`", but `POST /pulls/:id/review` still does;
  `src/app.ts` keeps a duck-typed ZodError fallback so it still returns 422. Evidence:
  `README.md:51-53`, `src/modules/reviews/routes.ts:32`.
- **2026-09-23** — README mentions "the two built-in agents"; the seed creates
  three (General, Security, Performance). Evidence: `README.md:109`,
  `src/db/seed.ts:22`.

## Open questions

- **2026-09-23** — Can `pnpm build && pnpm start` run at all? `tsc` does not
  rewrite the `@devdigest/*` path aliases and does not copy `src/prompts/*.md`
  to `dist`; CI and `scripts/e2e.sh` run the API with `tsx` instead. Not
  verified. Evidence: `tsconfig.json:21-26`, `src/platform/prompts.ts:12-14`.
