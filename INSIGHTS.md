# devdigest — cross-cutting insights

Traps that belong to no single package: `scripts/`, Docker, CI, contract drift
between server and client, the pnpm/npm split. Package-local traps go in
`<package>/INSIGHTS.md`. Newest first, one entry per trap.
Format: date · symptom · cause · rule.

Appended by the `engineering-insights` skill: append-only, never rewritten.

## What Works

Approaches and solutions that held up here.

## What Doesn't Work

Dead ends and antipatterns. The most frequently skipped section and the most
valuable one.

## Codebase Patterns

Conventions and structural decisions a newcomer would otherwise re-derive.

- **2026-09-20 — "Which reviews does the PR-list FINDINGS column count?" is defined TWICE.**
  The server picks them for the chips (`pickLatestReviewIds`: each agent's newest
  `kind='review'` review, per PR), and the client re-derives the same set for the
  hover preview (`latestReviewPerAgent`) from `GET /pulls/:id/reviews`, because the
  list payload carries only counts. Change the rule on one side and nothing fails:
  the chips and the card just disagree, and `FindingsPreviewCard`'s "+N more"
  goes negative. `PRRow.test.tsx` mocks `usePrReviews`, so no test spans both.
  Rule: touch either function → change and test the other in the same commit.
  `server/src/modules/pulls/status.ts` (`pickLatestReviewIds`),
  `client/src/components/findings-preview/helpers.ts` (`latestReviewPerAgent`)

- **2026-09-19 — `diff -r` over the two `vendor/shared` copies is NOT a drift gate.**
  Root `CLAUDE.md` says the client copy "has already drifted", but not that the
  drift is permanent and load-bearing: `eval-ci.ts`, `knowledge.ts`,
  `productionize.ts` and `trace.ts` differ today (the server copy knows
  `openrouter`, `AgentManifest`, `AgentVersion`; the client copy does not). A
  whole-directory diff therefore always prints pages of noise, and a real
  divergence in the file you just edited is invisible inside it.
  Rule: after changing a contract, diff ONLY the files you touched —
  `for f in findings.ts platform.ts; do diff -q server/src/vendor/shared/contracts/$f client/src/vendor/shared/contracts/$f; done`
  — and expect that check to be silent.
  `server/src/vendor/shared/contracts/`, `client/src/vendor/shared/contracts/`

## Tool & Library Notes

Quirks of tooling shared across packages: Docker, pnpm/npm, CI.

- **2026-09-26 — `typecheck` in `server/` and `reviewer-core/` never type-checks `test/`, so "typecheck is green" says nothing about test files.**
  Both `tsconfig.json` files have `"include": ["src/**/*.ts"]`. Root `CLAUDE.md`
  asks for `pnpm typecheck && pnpm test` before "done", which reads as covering
  everything, but a type error in a test file only surfaces (or not) at vitest
  runtime, where esbuild strips types. Proof: `reviewer-core/test/run.test.ts:111`
  (`async completeStructured<T>(req)` in an object typed `LLMProvider`) has carried
  `TS7006: Parameter 'req' implicitly has an 'any' type` unnoticed while
  `npm run typecheck` printed nothing. `client/` and `e2e/` were not checked.
  Rule: after writing or editing tests, type-check them separately with a scratch
  tsconfig that `extends` the package one, keeps `src/**` and adds `test/**`, and
  sets `typeRoots` to the package's `node_modules/@types` (a tsconfig outside the
  package cannot find `@types/node` otherwise). Do not treat the stock
  `typecheck` as proof for tests.
  `server/tsconfig.json:28`, `reviewer-core/tsconfig.json:28` ·
  `npx tsc -p <scratch>/tsconfig.json` → `test/run.test.ts(111,35): error TS7006`

- **2026-09-21 — `server` typecheck fails inside `../reviewer-core` when reviewer-core has no `node_modules`.**
  `server/tsconfig.json` aliases `@devdigest/reviewer-core` to `../reviewer-core/src`,
  so `tsc` compiles those sources and resolves their imports from
  `reviewer-core/node_modules`. In a fresh worktree or clone with only
  `server/` installed, `pnpm run typecheck` prints
  `../reviewer-core/src/llm/structured.ts(1,19): error TS2307: Cannot find module 'zod'`
  (plus `openai`, `openai/helpers/zod`). That reads like a broken server change, but
  nothing in `server/` is wrong.
  Rule: before trusting a server typecheck in a new checkout, run `npm install` in
  `reviewer-core/` as well. `pr-self-review`'s precheck reports this case by name.
  `server/tsconfig.json:24-25`

- **2026-09-21 — The installed zod 3.25 exports `zod/v4`, so the "Zod 3, not 4" rule is not enforced by the compiler.**
  `zod@3.25.76` (server, client, reviewer-core) exports `./v4`, `./v4-mini`,
  `./v4/mini` and `./v4/core`. `import { z } from 'zod/v4'` resolves, so Zod 4 API
  written that way passes typecheck. Only Zod 4 calls on the v3 `z` (`z.email()`,
  `z.strictObject()`) fail to compile.
  Rule: treat any `zod/v4`, `zod/mini` or `@zod/*` import as a violation. The check is
  a grep (`pr-self-review` precheck `zod-3-only`), never a typecheck.
  `node -p "Object.keys(require('./server/node_modules/zod/package.json').exports)"`

- **2026-09-21 — The installed pnpm (12.4.2) rejects `-s`.**
  `pnpm -s arch:check` fails with `error: unexpected argument '-s' found` before
  running anything, which reads like a broken script rather than a CLI change.
  Rule: invoke package scripts as `pnpm run <script>` in commands, docs and CI;
  do not copy `pnpm -s` from older snippets.
  `pnpm --version` → 12.4.2

## Recurring Errors & Fixes

An error seen twice, plus the fix that actually worked.

## Session Notes

Dated summary, only when a session changed how the stack is worked on.

## Open Questions

What was left unresolved, so the next session does not re-investigate blind.
