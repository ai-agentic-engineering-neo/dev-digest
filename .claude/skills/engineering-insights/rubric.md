# Insight rubric — the 6 sections of INSIGHTS.md

Every candidate goes into exactly one section. Examples marked ✓ show the level of detail;
they are illustrative, not facts about this repo.

## What Works
An approach that proved itself — ideally after an alternative failed.
- ✗ "Mocking helps with tests."
- ✓ "To test an SSE route, call `app.inject` and assert on the raw payload lines instead of opening a real EventSource — hermetic and 10× faster. Evidence: test/<file>.test.ts:NN"

## What Doesn't Work
A failed approach or anti-pattern, with the reason. Often the most valuable section — it saves repeating a dead end.
- ✗ "Refactoring the indexer was hard."
- ✓ "Running the indexer inside the request handler times out on repos >5k files; it must go through `container.jobs`. Evidence: src/modules/repo-intel/…:NN"

## Codebase Patterns
A non-obvious convention or architectural decision **with its rationale** that is not already in CLAUDE.md.
For a trade-off, say what was rejected and why. Also: files that are fragile or generated and
must not be edited by hand, undocumented env vars, modules whose purpose isn't clear from the name.
- ✗ "Modules have routes, service and repository." (already in server/CLAUDE.md → skip)
- ✓ "Review findings are re-scored from kept findings after grounding; the model's own score is ignored so a hallucinated finding can't inflate it. Evidence: reviewer-core/src/review/run.ts:NN"

## Tool & Library Notes
A quirk of a dependency or tool: Drizzle, drizzle-kit, Fastify, Next.js, next-intl, TanStack Query, Zod, pnpm/npm, vitest, testcontainers, agent-browser.
Includes command flags that are required but not in the package's CLAUDE.md.
- ✗ "Drizzle can be tricky with migrations."
- ✓ "`pnpm db:generate` produces an empty migration when the schema file isn't re-exported from src/db/schema.ts — add it to the barrel first."

## Recurring Errors & Fixes
Exact error text → cause → fix. Include the message so it can be found with grep.
- ✗ "Got a type error, fixed the import."
- ✓ "`ERR_MODULE_NOT_FOUND …/service` at runtime but typecheck passes → relative import is missing the `.js` suffix (ESM). Evidence: failing import in src/modules/x/routes.ts:3"

## Open Questions
Something unresolved that the next session should look into, or a promising observation that
could not be verified this session. Only `What` + `Evidence`.
Once answered, propose to the user moving the answer into the right section (don't delete it yourself).
- ✓ "Map-reduce mode sometimes returns duplicate findings for the same line — dedupe in reduce or in grounding? Evidence: run <id> trace"

## Always skip
- Already stated in `<pkg>/CLAUDE.md`, README.md, TESTING.md or an existing entry
  (e.g. "seed is required", "tests importing test/helpers/pg.ts must be *.it.test.ts").
- One-off typos, trivial fixes, anything a fresh agent would get right anyway.
- Narration of what was done this session (belongs in the commit message / PR).
- Anything containing secrets, tokens or personal data.
