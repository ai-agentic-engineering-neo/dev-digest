# `@devdigest/reviewer-core` — agent guide

The pure review engine: diff → prompt → LLM → grounded findings.

## Before answering

Curated docs here today: `INSIGHTS.md` (this package's traps), `README.md` (pipeline
diagram, public API), `../TESTING.md`, and the root `../INSIGHTS.md` for anything
crossing packages. No `docs/` or `specs/` in this package yet — read those first,
then code.

## Conventions (not obvious from code)

- **Purity is the contract.** No DB, GitHub, filesystem, `process.env`, or logging. The only side effect is the **injected** `LLMProvider`. Anything needing IO belongs in `server/`, not here — that constraint is what keeps the engine mock-testable and reusable by the CI runner (L06).
- **This package never emits JS.** `build` is a type-check (`tsc --noEmit`); consumers import the TypeScript **source** through a tsconfig path alias. Don't add an `outDir` or a dist step.
- **ESM**: relative imports carry the `.js` extension. Single quotes.
- **Grounding is a mandatory gate, not a filter you may skip.** A finding that doesn't cite a real line in the diff is dropped, and the score is recomputed from the survivors — the model's self-reported score is always ignored.
- **Injection defense is one shared rule**: `INJECTION_GUARD` is appended verbatim to every agent's system prompt in `prompt.ts`. Do **not** add keyword/denylist scanning of untrusted text — a denylist only catches one phrasing. Untrusted content is fenced by `wrapUntrusted`.
- **Optional prompt slots** (`skills`, `memory`, `specs`, `callers`) exist for later lessons; when a slot is omitted `assemblePrompt` just leaves that section out. Adding a slot must stay backward-compatible with callers that pass nothing.
- The public surface is whatever `src/index.ts` exports; contracts come from `@devdigest/shared` (aliased to the **server's** copy). `zod` is pinned to this package's own `node_modules` via a path alias.

## Do-not-touch

- Nothing exclusive to this package, but `@devdigest/shared` resolves into `server/src/vendor/shared/` — changing a contract from here edits the server's canonical copy.

## Use when

- Pipeline stages and public API → `README.md`
- Where the inputs come from (what the server actually passes) → `../server/README.md` § Review context
- Prompt wording and message layout → `../docs/agent-prompts/`
