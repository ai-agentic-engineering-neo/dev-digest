# reviewer-core (@devdigest/reviewer-core) — agent map
Inherits the root `CLAUDE.md`; only engine-specific rules here.

## Commands (npm, not pnpm)
- `npm test` · `npm run typecheck` (`build` is the same type-check — no JS output)

## Layout
- `src/prompt.ts` — prompt assembly, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate against the diff
- `src/llm/` — injected `LLMProvider` + structured output (Zod → JSON Schema)
- `src/review/` — `run` orchestration, `reduce`
- `src/output/` — `toReview` CI payload
- `src/index.ts` — the only public API

## Conventions
- **Pure:** no DB, GitHub, or FS. The only side effect is the injected
  `LLMProvider` — keep it that way, so the engine stays mock-testable.
- All external content (diff, PR body, code, specs) goes through `wrapUntrusted`.
- New exports go through `src/index.ts`; the server imports only from there.

## Gotchas
- Contracts come from `../server/src/vendor/shared` (path alias), not a local copy.
- Grounding is mandatory: findings without a real diff line are dropped, and the
  score is recomputed from the survivors — the model's score is ignored.
- Every change here also runs `server-unit` CI (the server type-checks against `src/`).

## Do not touch
- `INJECTION_GUARD` — don't weaken it, don't replace it with keyword scanning

## Read when
- Changing the pipeline or prompt slots → read `README.md` §Pipeline
- Changing exports → read `README.md` §Public API
- Design question → read `docs/`
- Implementing a feature → read its spec in `specs/`
- Before finishing → check `INSIGHTS.md`; append new lessons
