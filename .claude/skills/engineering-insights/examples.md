# engineering-insights — examples: bad vs good

Main rule: an entry must be actionable "cold" — an agent reads it and KNOWS what to do, without investigating.
Test: "if it would be obvious to anyone reading the code, don't write it".
(The entries below illustrate the format using DevDigest material; they are not verified facts.)

## What Works
- ❌ `Tests pass now.` — what worked, and when should it be repeated?
- ✅ `- 2026-11-20 · server/tests · unit tests without Docker failed on the pg import → ALWAYS run pnpm exec vitest run --exclude '**/*.it.test.ts', because the local test:unit script in package.json differs (skip-worktree) · server/CLAUDE.md Gotchas`

## What Doesn't Work
- ❌ `Be careful with async.` — noise, not a lesson.
- ✅ `- 2026-11-20 · server/review · the review live log vanished after a restart; hunted for an SSE bug → NEVER debug SSE before checking for a restart: RunBus lives in memory, orphaned runs are cleaned by the reaper · server/src (RunBus)`

## Codebase Patterns
- ❌ `We use DI.` — obvious from the code.
- ✅ `- 2026-11-20 · server/modules · a new adapter created with new inside a module broke the test mocks → ALWAYS get adapters via container.*, because MockLLMProvider/MockGitClient are swapped in only there · server/src/platform/container.ts`

## Tool & Library Notes
- ❌ `Zod sometimes behaves weirdly.`
- ✅ `- 2026-11-20 · server/zod · an example from the Zod v4 docs didn't compile → NEVER take API from the v4 docs: this repo is on Zod 3.25 + fastify-type-provider-zod 4 · server/package.json`

## Recurring Errors & Fixes
- ❌ `There was a type error, fixed it.`
- ✅ `- 2026-11-20 · reviewer-core · CI server-unit failed after a change only in reviewer-core → ALWAYS run server typecheck after changes in reviewer-core/**, because server imports its sources via a path alias · CLAUDE.md (Cross-package)`

## Session Notes
- ❌ `Worked a lot on the server today.`
- ✅ `- 2026-11-20 · server/review SSE · found that the live log is lost on restart; added 1 entry to What Doesn't Work`

## Open Questions
- ❌ `Not clear how repo-intel works.`
- ✅ `- 2026-11-20 · server/repo-intel · a review without an index silently runs on the diff only — should the UI show this? → check specs/ and ask the owner before changing behavior · server/CLAUDE.md Gotchas`

## NOT an insight — don't write
- `- … · npm install failed with ETIMEDOUT → retried` — a transient network failure.
- `- … · useEffect needs a dependency array` — general knowledge from official docs.
- `- … · the Save button doesn't save the draft` — an active bug → issue, not INSIGHTS.
- `- … · moving from p-queue to BullMQ` — an architecture decision → ADR / docs/.
