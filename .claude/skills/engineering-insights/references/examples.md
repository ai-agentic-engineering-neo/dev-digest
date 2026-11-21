# Examples — vague vs useful

The test for every entry: **if it would be obvious to anyone reading the code — don't write it.**
A good entry is actionable "cold": the next agent reads it and KNOWS what to do, without re-investigating.
These are illustrations of the FORM — not recorded insights; don't treat them as facts about the code.

## Classic pairs (MindStudio)

| ❌ Bad | ✅ Good |
|---|---|
| "Promises can be tricky" | "`Promise.all()` in the ingest pipeline times out after 30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "Checkout-flow state always goes through Zustand (`cartStore.ts`) — the cart is shared by 3 components; local state doesn't work here" |

## One per section, in this repo's terms

**What Works**
- ❌ "Mocking helps in tests"
- ✅ "To test a review run without an API key, inject `ContainerOverrides` with `MockLLMProvider` from `src/adapters/mocks.ts` — no network, deterministic output."

**What Doesn't Work**
- ❌ "Editing shims didn't help"
- ✅ "Changing grounding in `server/src/platform/grounding.ts` has no effect — it only re-exports `@devdigest/reviewer-core`. Fix it in `reviewer-core/src/grounding.ts`."

**Codebase Patterns**
- ❌ "Findings are filtered"
- ✅ "A new full-file finding kind must be added to `FULL_FILE_KINDS` (`src/grounding.ts`), otherwise grounding drops it for not intersecting a hunk."

**Tool & Library Notes**
- ❌ "Zod has type issues"
- ✅ "`zod` is pinned to reviewer-core's own `node_modules` via `tsconfig.json` paths — installing zod elsewhere gives two Zods and 'type is not assignable' errors across the package boundary."

**Recurring Errors & Fixes**
- ❌ "CI failed on tests"
- ✅ "`server-unit` job fails with a testcontainers/Docker error → the test imports `test/helpers/pg.ts` but isn't named `*.it.test.ts`. Rename it."

**Session Notes**
- ❌ "### 2026-11-21 · worked on server" + "did some fixes"
- ✅ "### 2026-11-21 · map-reduce cost spike" + "- traced to `selectMode` (`src/review/run.ts`): >400 lines AND >1 file → see Codebase Patterns entry of the same date"

**Open Questions**
- ❌ "Not sure about performance"
- ✅ "Does `buildCallersDigest` time out on repos with >5k files? Saw one 30 s stall on a local clone, not reproduced yet."
