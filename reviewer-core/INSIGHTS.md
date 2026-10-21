# reviewer-core — INSIGHTS

Append-only engineering insights for `reviewer-core/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] The response shape is enforced by a strict `json_schema` response format sent out of band, not by prompt text; the model cannot return a non-conforming object. Evidence: `reviewer-core/src/llm/openrouter.ts:75`.
- [2026-09-25] Score is recomputed from grounded findings (100, minus 35 per CRITICAL, 12 per WARNING, 3 per SUGGESTION), so the number always matches the list. Evidence: `reviewer-core/src/review/reduce.ts:27`.

## What Doesn't Work

- [2026-09-25] Describing the JSON shape, a markdown layout, or a different severity scale in an agent prompt. It conflicts with the strict schema and degrades the fields the prompt did not pin down. Evidence: `docs/agent-prompts/README.md`.
- [2026-09-25] Prompts that say "return at most N findings". Models treat it as a quota and pad with duplicates, which also corrupts the score. Evidence: `docs/agent-prompts/README.md`.
- [2026-09-25] Keyword-scanning untrusted text for prompt injection. A denylist catches one phrasing; the defense is `INJECTION_GUARD` appended to every system prompt. Evidence: `reviewer-core/src/prompt.ts:16`.

## Codebase Patterns

- [2026-09-25] `verdict` is passed through from the model; only `score` is derived. The verdict conventions in the prompt guide are load-bearing. Evidence: `reviewer-core/src/review/run.ts:193`.
- [2026-09-25] `auto` strategy picks map-reduce only when the diff exceeds 400 changed lines AND touches more than one file; otherwise one call. Evidence: `reviewer-core/src/review/run.ts:120`.
- [2026-09-25] Finding kinds `secret_leak`, `lethal_trifecta`, `phantom`, `hook` skip the hunk-intersection check and only need the file present in the diff. Evidence: `reviewer-core/src/grounding.ts:16`.
- [2026-09-25] Cancellation is a caller-supplied `checkCancelled` that throws; the engine never imports the server's error type. Evidence: `reviewer-core/src/review/run.ts:checkCancelled`.

## Tool & Library Notes

- [2026-09-25] `@devdigest/shared` resolves to `../server/src/vendor/shared`, and `zod` is pinned to this package's own `node_modules` via tsconfig paths to avoid duplicate zod instances. Evidence: `reviewer-core/tsconfig.json:24`.
- [2026-09-25] This package uses npm (`package-lock.json`), not pnpm. `npm run typecheck` is the build; nothing is emitted. Evidence: `reviewer-core/package.json:scripts.typecheck`.
- [2026-10-21] Zod 3.25 default issue messages echo the received value for invalid_enum_value, invalid_literal, unrecognized_keys and invalid_union_discriminator ('received "..."'), so a Zod issue list built from i.message is not safe to log when the input is model output. parseWithRepair keeps those codes path-only in .error and the full text only in .repromptMessage; never log or store repromptMessage. Evidence: `reviewer-core/src/llm/structured.ts:ECHOING_ISSUE_CODES`.

## Recurring Errors & Fixes

_None yet._

## Session Notes

- [2026-09-25] Initial capture from a read-through of the engine and the prompt guide. No code changed. Evidence: `reviewer-core/CLAUDE.md`.
- [2026-09-25] HW1 criteria pass: ESLint added (`npm run lint`), one `no-useless-assignment` fix in `OpenRouterProvider`; docs/pipeline.md + specs/review-contract.md written by a subagent, which flagged that the server's 'map-reduce' integration test actually runs single-pass. Evidence: `reviewer-core/eslint.config.mjs`.
- [2026-10-06] Intent layer: deriveIntent + INTENT_SYSTEM_PROMPT in src/intent.ts; assemblePrompt intent slot before PR description with a trusted confidence note; INJECTION_GUARD unchanged. Evidence: `reviewer-core/src/intent.ts; reviewer-core/src/prompt.ts`.
- [2026-10-21] feat-pr-brief: OpenRouterProvider.completeStructured final error now carries the parse issues (capped, log-safe); parseWithRepair returns a fixed 'Output was not valid JSON' error and keeps detail in the reprompt; new test openrouter-structured.test.ts. Evidence: `reviewer-core/src/llm/openrouter.ts:completeStructured`.

## Open Questions

- [2026-09-25] Should `verdict` be derived deterministically from grounded severities, the way `score` and the CI gate already are, so a wrong model verdict cannot reach the UI? Evidence: `reviewer-core/src/review/run.ts:verdict`.
