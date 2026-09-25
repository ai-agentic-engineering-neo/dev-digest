# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: diff → prompt → LLM → grounded findings. No DB, GitHub, or
filesystem. The only side effect is the injected `LLMProvider`. Pipeline
diagram: `README.md`.

## Commands (npm)

```sh
npm test            # vitest, stubbed LLMProvider, no network
npm run typecheck   # also the build; the package never emits JS
```

## Layout

- `src/index.ts` — the public surface. Consumers import only from here.
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — citation gate: a finding must intersect a real diff hunk or it is dropped.
- `src/review/run.ts` — `reviewPullRequest` (single-pass vs map-reduce). `src/review/reduce.ts` — merge partials, `scoreFromFindings`.
- `src/llm/` — `OpenRouterProvider`, structured output (Zod → JSON Schema, parse-with-repair).
- `src/output/to-review.ts` — grounded Review → GitHub review payload.

## Conventions

- Keep it pure: no I/O, no env reads, no persistence. Callers (server, CI runner) own those.
- Consumed as TypeScript source via path alias. `@devdigest/shared` resolves to `../server/src/vendor/shared`.
- Untrusted content (diff, PR body, repo map, specs) is delimiter-wrapped. `INJECTION_GUARD` is the defense; never add keyword scanning for prompt injection.
- Score is recomputed from surviving findings. Never trust the model's score.
- Output shape is enforced by the provider's strict JSON schema, not by prompt text.
- Cancellation is a caller-supplied `checkCancelled` that throws; the engine stays agnostic about the error type.

## Read when relevant

- `README.md` · `../docs/agent-prompts/README.md` · `docs/` · `specs/` · `INSIGHTS.md`
