# reviewer-core — insights

Non-obvious lessons learned while working in `reviewer-core/`. Maintained by the `engineering-insights` skill.
Append-only: new lines go at the end of their section; corrections are new dated entries.
Format: `- YYYY-MM-DD — <what is true / what happened> → <what to do instead> (path:line → symbol)`.
Add an entry only if forgetting it would make an agent (or a human) repeat the mistake.

## What Works
<!-- Approaches that proved effective here -->

## What Doesn't Work
<!-- Dead ends and antipatterns — the most valuable section -->
- 2026-11-04 — `sliceDiff` picks a file's lines by substring (`line.includes(\`b/${path}\`)`), so the slice for `src/a.ts` also contains the whole `src/a.tsx` diff (checked with a tsx script). In map-reduce, a.tsx gets reviewed twice, and `reduceReviews` doesn't dedup → match the exact header `diff --git a/<path> b/<path>` before trusting per-file chunks (src/review/reduce.ts:58 → sliceDiff).

## Codebase Patterns
<!-- Conventions and architecture decisions, with the reason -->
- 2026-11-04 — `test/run.test.ts` imports `MockLLMProvider`/`MockGitClient` from `../../server/src/adapters/mocks.js`. Its assertions rely on that mock diff (`src/config.ts` line 11 is in a hunk). But `.github/workflows/reviewer-core.yml` only triggers on `reviewer-core/**` and `server/src/vendor/shared/**` → after editing `server/src/adapters/mocks.ts` or `diff-parser.ts`, also run `npm test` in reviewer-core (test/run.test.ts:3 → MockLLMProvider import).
- 2026-11-04 — "Grounded" does not mean "changed". The server's diff parser puts context lines into `newLineNumbers`, so a finding that cites only an unchanged context line passes `groundFindings` → don't treat kept findings as touching added lines. To anchor a GitHub comment, use `toReviewPayload`'s nearest-in-diff-line logic (src/grounding.ts:24 → buildLineIndex; server/src/adapters/git/diff-parser.ts:71 → parseUnifiedDiff).
- 2026-11-04 — One chunk can bill up to `maxRetries+1` (default 3) schema-repair completions, and each can retry 2× more at the transport level (OpenAI SDK `maxRetries: 2`). If the last attempt fails, `completeStructured` throws, and none of those tokens reach `onUsage` → treat `onUsage`/`UsageTally` totals on failed runs as a lower bound, not the real spend (src/llm/openrouter.ts:115 → completeStructured).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — `npm run typecheck` checks only `src/**/*.ts` (tsconfig `include`), and vitest strips types without checking them, so type errors in `test/*.ts` never fail locally or in CI → after changing a public type (`ReviewInput`, `ReviewOutcome`…), type-check the tests explicitly (e.g. temporarily add `"test/**/*.ts"` to `include` and run `npm run typecheck`) (reviewer-core/tsconfig.json:28 → include).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Knowledge-file pass: wrote docs/pipeline.md, docs/providers-and-cost.md, specs/review-engine.md (current-behavior contract) from reading the code.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `checkCancelled` runs only *before* each chunk's LLM call, never after it. Single-pass has exactly one checkpoint, so a cancel that arrives during the in-flight call is ignored. The server then finishes the run, and `completeAgentRun` (no status guard) overwrites the row's `cancelled` with `done` → decide whether to add a post-call checkpoint or an AbortSignal on the provider (src/review/run.ts:178 → reviewPullRequest).
