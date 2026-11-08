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
- 2026-11-05 — `skills` is `SkillInput[]` = `string | { name, body, trusted: false }`: strings are rendered verbatim (the server adds the `### name` heading), objects are wrapped `<untrusted source="skill:…">` and `IMPORTED_SKILL_GUARD` is appended to the system message ONLY when such a skill is present → CI-runner callers passing plain strings get a byte-identical prompt; don't format trusted skills here (src/prompt.ts:49 → renderSkill).

## Tool & Library Notes
<!-- Dependency / tooling quirks -->
- 2026-11-04 — `npm run typecheck` checks only `src/**/*.ts` (tsconfig `include`), and vitest strips types without checking them, so type errors in `test/*.ts` never fail locally or in CI → after changing a public type (`ReviewInput`, `ReviewOutcome`…), type-check the tests explicitly (e.g. temporarily add `"test/**/*.ts"` to `include` and run `npm run typecheck`) (reviewer-core/tsconfig.json:28 → include).
- 2026-11-05 — Type-checking tests (temp tsconfig with `include: ["src/**/*.ts","test/**/*.ts"]`) shows 2 PRE-EXISTING `TS7006 'req' implicitly any` errors in test/run.test.ts:111/:142 (present on main) → treat them as the baseline; only new errors are regressions (test/run.test.ts:111 → completeStructured mock).

## Recurring Errors & Fixes
<!-- Symptom → root cause → fix -->
- 2026-11-07 — Review runs on OpenRouter (`deepseek/deepseek-v4-flash`) fail with `402 … You requested up to 131072 tokens, but can only afford N`: the review's `completeStructured` call passes no `maxTokens`, so `OpenRouterProvider` omits `max_tokens` and OpenRouter reserves the model maximum on low-limit keys (same cause as server conventions 2026-11-05, but this path is still uncapped; PR #3 / #28 Security runs failed so). Uncapped also disables the truncation retry (it only fires when a cap is set) → pass an explicit review cap BELOW `TRUNCATION_TOKEN_CEILING` (16_000), e.g. 8_000, so a cut-off reply is retried at 16_000; a cap equal to the ceiling never retries (src/review/run.ts:194 → reviewPullRequest `completeStructured`; src/llm/openrouter.ts:85 → max_tokens spread, :125 → truncation retry; plans/mcp.md T1).

## Session Notes
<!-- Wrap-up: one dated line per substantive task -->
- 2026-11-04 — Knowledge-file pass: wrote docs/pipeline.md, docs/providers-and-cost.md, specs/review-engine.md (current-behavior contract) from reading the code.
- 2026-11-05 — Added imported-skill support to assemblePrompt (`SkillInput`, untrusted wrap + guard) for the Skills feature → ../server/specs/skills.md.

## Open Questions
<!-- Unresolved items, known gaps -->
- 2026-11-04 — `checkCancelled` runs only *before* each chunk's LLM call, never after it. Single-pass has exactly one checkpoint, so a cancel that arrives during the in-flight call is ignored. The server then finishes the run, and `completeAgentRun` (no status guard) overwrites the row's `cancelled` with `done` → decide whether to add a post-call checkpoint or an AbortSignal on the provider (src/review/run.ts:178 → reviewPullRequest).
