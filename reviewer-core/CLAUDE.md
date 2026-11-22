# reviewer-core (`@devdigest/reviewer-core`) — instructions for Claude

Pure review engine: diff → prompt → LLM → grounded findings. Source of truth: `reviewer-core/README.md`.

## Commands

- Tests (hermetic, stubbed LLM, no keys or network): `npm test`
- Typecheck, which doubles as the build: `npm run typecheck`

## Rules

- **No I/O.** No database, filesystem, or network calls. The only side effect is the injected `LLMProvider`. Put I/O in `server/` (or the CI runner), never here.
- **The package never emits JS.** `server/` consumes this TypeScript source directly through the tsconfig path alias `@devdigest/reviewer-core` → `../reviewer-core/src`.
- **Grounding is mandatory** (`src/grounding.ts`). Every finding must cite a line in the diff, or it is dropped.
- **Score is recomputed** from surviving findings. The model's score is ignored.
- **Prompt safety:** `assemblePrompt` appends `INJECTION_GUARD` and fences untrusted content via `wrapUntrusted`. Keep both; don't add keyword scanning.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`. Don't redefine them locally.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are for later milestones. Leave them out unless asked; `assemblePrompt` omits empty sections.
