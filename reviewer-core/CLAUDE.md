# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → structured findings → grounding gate.
Human docs: `README.md` (source of truth).

## Where things live
- `src/review/run.ts`      `reviewPullRequest` entry point (single-pass / map-reduce)
- `src/prompt.ts`          prompt assembly + `INJECTION_GUARD`
- `src/grounding.ts`       drops findings that cite lines not in the diff
- `src/llm/`               structured output (zod → JSON Schema, parse-with-repair), OpenRouter provider
- `src/output/to-review.ts` grounded Review → GitHub review payload
- `src/index.ts`           the public API — server imports only from here

## Conventions (non-default)
- No I/O: no DB, filesystem, GitHub or env reads. The only side effect is the
  injected `LLMProvider`. Callers resolve skills/memory/specs into strings.
- Uses npm (`package-lock.json`), not pnpm.
- `build` is only a type-check — consumers import the TS source via tsconfig alias.
- `@devdigest/shared` resolves to `../server/src/vendor/shared`; `zod` is
  force-aliased to this package's `node_modules` (one zod instance). Keep both aliases.

## Do not touch
- `INJECTION_GUARD` — don't weaken it or add keyword denylists.
- Grounding + score recompute — the model's self-reported score stays ignored.

## Read when
- Changing pipeline steps or the public API → README.md §Pipeline and §Public API.
- Writing tests (LLM is always stubbed) → README.md §Testing.
- Implementing an engine feature → its spec in `specs/`.
- Before any edit here → INSIGHTS.md.
