# Insights — reviewer-core

Lessons learned in `reviewer-core/` that the code doesn't tell you. Written by the
`engineering-insights` skill via `.claude/skills/engineering-insights/scripts/append_insight.py`.
**Append only** — new bullets go on top of a section; existing lines are never changed by agents.
Format: `- YYYY-MM-DD — <where>: <fact> → <action>`.
Reviewed monthly: stale entries are removed in a dedicated commit.

## What Works
<!-- approaches and solutions that worked here -->

## What Doesn't Work
<!-- dead ends and anti-patterns — the most valuable section -->

## Codebase Patterns
<!-- conventions and architectural decisions not obvious from the code -->
- 2026-09-24 — src/prompt.ts sections + server/src/platform/prompt-log.ts: every assembled prompt now reports per-section metadata (name, source, role, trust, chars, tokens) and the server's pino 'prompt_assembled' record keeps a section only if its name is in PROMPT_SECTION_NAMES (exported here) or the server's SERVER_ONLY_SECTION_NAMES AND its source is in prompt-log.ts KNOWN_SECTION_SOURCES — a section with a new source kind is dropped from the log without any error (verified 2026-09-24 by a delta-review scratch run) → when adding a prompt section, add its name to PROMPT_SECTION_NAMES and, if it uses a new source kind, to KNOWN_SECTION_SOURCES; never put section text into the metadata
- 2026-09-24 — src/prompt.ts assemblePrompt: PromptAssembly's per-slot trace fields are inconsistent about wrapUntrusted — assembly.specs stores the WRAPPED joined text (already <untrusted>-tagged), while assembly.repoMap/callers/prDescription store the RAW pre-wrap content — a new optional slot (e.g. intent) should default to the raw-content convention (simpler, and it's what the client's PromptBlock just renders as text either way) unless there's a specific reason to match specs → verified by reading every 'assembly.<field> =' assignment in assemblePrompt side by side
- 2026-09-22 — src/llm/usage.ts addCost is null-propagating and server UsageMeter/run-executor reuse it, so ONE unpriced attempt (model missing from server/src/adapters/llm/pricing.ts and no OpenRouter usage.cost) nulls the whole run's cost_usd → when a new model becomes selectable, add it to pricing.ts; a partial-sum flag would need a DB column (migration)
- 2026-09-22 — test/fixtures (StubLLM + pre-parsed configDiff/twoFileDiff): the run/abort tests no longer import server/src/adapters/mocks — supersedes the earlier run.test.ts coupling note → new engine tests must use these fixtures; only @devdigest/shared contracts may come from server/ (via the vitest alias)
- 2026-09-22 — src/prompt.ts wrapUntrusted: the escaped delimiter form '<\/untrusted>' is pinned by server/test/prompt-callers.test.ts, which reviewer-core's own suite never runs → if you change the escape format, run `cd server && npx vitest run test/prompt-callers.test.ts` too (current escape inserts a backslash after '<' so the legacy form is preserved)
- 2026-09-22 — test/run.test.ts: imports MockLLMProvider/MockGitClient from ../../server/src/adapters/mocks.js, so the pure core's test suite depends on server/ (fails if reviewer-core is used standalone, and reviewer-core.yml does not trigger on server/src/adapters changes) → when touching those mocks, run reviewer-core tests too; target fix is local fixtures in reviewer-core/test

## Tool & Library Notes
<!-- dependency quirks, versions, flags -->
- 2026-09-22 — openai SDK 4.104 core.js makeRequest: it re-checks options.signal before every internal retry, but the backoff sleep between retries is NOT abortable (up to ~8s) → to bound SDK retries, pass ONE AbortSignal.any([caller, AbortSignal.timeout(budget)]) plus a per-request timeout capped at the remaining budget (see src/llm/budget.ts); don't rely on maxRetries×timeout arithmetic

## Recurring Errors & Fixes
<!-- error message → cause → fix -->

## Session Notes
<!-- YYYY-MM-DD — one-line summary of a meaningful session -->

## Open Questions
<!-- what is still unresolved -->
