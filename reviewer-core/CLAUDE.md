# reviewer-core — review engine

Pure logic: diff → prompt → LLM → grounded findings. Pipeline diagram and public API: `README.md`.

## Rules
- NO database, GitHub, or filesystem access. The only side effect is the injected `LLMProvider`.
- Consumed by `server/` as TypeScript **source** via tsconfig path alias; there is no JS output. `build` is only a type-check.
- Tests use a stubbed `LLMProvider`: no keys, no network. Run with `npm test` (this package uses npm, not pnpm).

## Gotchas
- Grounding (`groundFindings`) is a mandatory gate; the score is recomputed from surviving findings.
- `INJECTION_GUARD` is appended to every agent's system prompt in `assemblePrompt`. Do not weaken or replace it with text scanning.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) and `reduce()` exist for later milestones; the starter doesn't feed them.
- Contracts (`Review`, `Finding`, `Verdict`) come from `@devdigest/shared`, vendored in `server/src/vendor/shared`.

## Look here when relevant (not auto-loaded)
- Prompt assembly rules: `../docs/agent-prompts/README.md`
- `docs/` explanations · `specs/` feature briefs · `INSIGHTS.md` learned gotchas
