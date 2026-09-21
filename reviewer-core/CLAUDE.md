# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. The root `CLAUDE.md` applies.

## Use when

- Changing prompt assembly, grounding or structured output → read `README.md` (pipeline, public API)
- Changing severity, verdict or score semantics → read `../docs/agent-prompts/README.md` first —
  the engine and the prompts must agree
- Feeding a new prompt slot (skills, memory, specs, callers) → read `src/prompt.ts`: the slots
  already exist in `PromptParts`, the server simply does not pass them yet
- Implementing a feature → read its spec in `specs/`; write one first if it is missing. A feature
  that also needs the server or the client goes in the repository-root `specs/` instead
- Something surprised you, or a fix was not obvious → `INSIGHTS.md`, through the
  `engineering-insights` skill, which carries the format and the rules
- Need depth the README does not give → `docs/`

## Rules not visible from any single file

- No DB, no GitHub, no filesystem. The only side effect is the injected `LLMProvider` — that is what
  keeps the tests hermetic. Do not add an adapter here.
- The package never emits JS: the server imports `src/` through a tsconfig alias, so `pnpm typecheck`
  **is** the build.
- `@devdigest/shared` resolves here to the **server** copy (`../server/src/vendor/shared`), not the
  client's.
- `groundFindings` is a mandatory gate, and `scoreFromFindings` recomputes the score from the
  survivors — the model's own score is never used. Weights live in `SEVERITY_PENALTY`
  (`src/review/reduce.ts`); read them there rather than assuming.
- `assemblePrompt` appends a private `INJECTION_GUARD` to every system prompt and delimiter-wraps
  untrusted blocks. Never restate that guard inside an agent prompt, and do not add keyword scanning.

## Naming (package-only)

- Relative imports carry `.js`, same as `server` and unlike `client`: `from './prompt.js'`.
  `moduleResolution` is `Bundler`, so typecheck does not enforce it — the server consumes this
  source as real ESM, so the extension has to be there.

## Commands

```sh
pnpm typecheck    # this is the build
pnpm test         # stubbed LLMProvider — no keys, no network
```
