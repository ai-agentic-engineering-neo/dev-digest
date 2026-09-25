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
- [2026-09-25] Cancellation is a caller-supplied `checkCancelled` that throws; the engine never imports the server's error type.

## Tool & Library Notes

- [2026-09-25] `@devdigest/shared` resolves to `../server/src/vendor/shared`, and `zod` is pinned to this package's own `node_modules` via tsconfig paths to avoid duplicate zod instances. Evidence: `reviewer-core/tsconfig.json:24`.
- [2026-09-25] This package uses npm (`package-lock.json`), not pnpm. `npm run typecheck` is the build; nothing is emitted.

## Recurring Errors & Fixes

_None yet._

## Session Notes

- [2026-09-25] Initial capture from a read-through of the engine and the prompt guide. No code changed.

## Open Questions

- [2026-09-25] Should `verdict` be derived deterministically from grounded severities, the way `score` and the CI gate already are, so a wrong model verdict cannot reach the UI?
