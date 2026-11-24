# reviewer-core — insights

What the code of this module does not show: lasting facts about it, and the
lessons of past work sessions. Read it before working here. It is the one place
for this knowledge: the `engineering-insights` skill appends to it, and people
edit it.

- **Key Facts** is curated. Edit or remove an entry when it stops being true.
  Format: `### YYYY-MM-DD — short title`, then **What happened**, **Why** and
  **Rule**.
- Every other section is append-only. Add entries, never rewrite or delete
  them; correct one by appending a new dated entry that names it. Format:
  `- YYYY-MM-DD — <specific lesson and the action to take>. Evidence: path:line`

## Key Facts

<!-- Lasting facts about the module, promoted from the sections below. -->

## What Works

<!-- Approaches and solutions that worked here. -->

## What Doesn't Work

<!-- Dead ends and antipatterns. The most valuable section; do not skip it. -->

- 2026-11-22 — Do not read a score of 100 as "the reviewer found the code clean": the score is 100 minus penalties over the grounded findings, so every zero-finding run is exactly 100 whatever the model thought (its own scores in such runs were 0, 95 and 100). To judge a reviewer, run it on a known-defect diff: upstream `ai-agentic-engineering-neo/dev-digest` PR #13 (SSRF through `fetch(req.body.url)`) and PR #12 (N+1 queries in a loop) are such fixtures and #14 is the clean control. On them the three seeded agents scored 18–97 with 1–3 findings each, while the same agents returned 0 findings in all 12 runs on three feature PRs. Evidence: reviewer-core/src/review/run.ts:208

## Codebase Patterns

<!-- Conventions and structure that are not obvious from one file. -->

## Tool & Library Notes

<!-- Quirks of dependencies and tooling. -->

- 2026-11-22 — `deepseek/deepseek-v4-flash` through OpenRouter picks its own reasoning effort, and the call sets neither `reasoning` nor `max_tokens`. Of 12 real runs, 5 billed no reasoning tokens (2–6 s on prompts of 15K–40K tokens; completion tokens equal to the visible JSON), 6 billed 1.6K–7.7K, and one ran 20 minutes and 264K completion tokens; the 90 s client timeout did not stop it. Before trusting or comparing runs, compare `tokens_out` with the length of `raw_output` in the trace. Evidence: reviewer-core/src/llm/openrouter.ts:69

- 2026-11-22 — When a structured response fails validation, the trace keeps only the last attempt's raw output, so anything the model wrote in a rejected first answer is gone. A retry is visible only as `tokens_in` well above one prompt (one call is about `prompt chars / 3.35` tokens): the 264K-token run reported 41.6K tokens in for a 50K-char prompt, i.e. two calls carrying about 11K tokens of rejected output, and then returned an empty findings list. Evidence: reviewer-core/src/llm/openrouter.ts:112

## Decisions

<!-- A decision and the reason for it. -->

## Recurring Errors & Fixes

<!-- An error seen more than once, with its fix. -->

## Session Notes

<!-- One dated line per work session. -->

- 2026-11-21 — Added CLAUDE.md, INSIGHTS.md, docs/ and specs/ for the package; no source code changed.

- 2026-11-22 — Investigated why every real review scored 100: no pipeline defect (the model returned an empty findings list, grounding `0/0`); the agents do report on fixture PRs #12 and #13. No source code changed.

- 2026-11-23 — Merged `LEARNINGS.md` into this file; no source code changed.

## Open Questions

<!-- What is still unresolved. -->
