# reviewer-core — `@devdigest/reviewer-core`

The review engine: **diff → prompt → LLM → grounded findings**. Pure logic — no
database, GitHub or filesystem. The only side effect is an LLM call through an
injected `LLMProvider`, which is what makes the whole package mock-testable.

## Commands

npm, not pnpm: `npm test` (vitest, hermetic) · `npm run typecheck`

`npm run build` is a type-check — **the package never emits JS**. Consumers compile
its TypeScript source directly through a tsconfig path alias.

## Map

- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — the citation gate, `groundFindings`
- `src/llm/` — provider call and structured output (Zod → JSON Schema, repair)
- `src/review/` — `run` (single pass) and `reduce` (map-reduce path)
- `src/output/to-review.ts` — the CI payload helper
- `src/index.ts` — the entire public surface
- `test/` — hermetic units with a stubbed provider

## Read when

- Changing the pipeline or its stages → `README.md` § "Pipeline".
- Adding or renaming an export → `README.md` § "Public API"; `src/index.ts` is the
  contract other packages compile against.
- Changing what the model receives → `../server/README.md` § "Review context
  (non-obvious)"; the server assembles the inputs this package formats.
- Working from a spec → `specs/<feature>.md`, before the first edit.
- Something behaves inexplicably → `INSIGHTS.md` (§ What Doesn't Work, § Recurring Errors).
- You learned something non-obvious → append it to the matching `INSIGHTS.md` section.
- Touching severity, the score or the CI gate → `docs/severity.md`: one enum,
  four derived tables, all read with `?? 0`.
- Deeper background on a stage → `docs/`.

## Conventions

- **Stay pure.** No DB, network, filesystem or environment reads; new outside
  capability arrives as an injected port, never as an import.
- **Grounding is mandatory.** A finding that does not cite a real line in the diff
  is dropped, and the score is recomputed from the survivors — the model's
  self-reported score is ignored.
- **Prompt-injection defense is one shared trusted rule**, the `INJECTION_GUARD`
  appended to every system prompt. Do not add keyword scans or denylists over
  untrusted text: a denylist only catches one phrasing.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are omitted when
  empty — `assemblePrompt` simply leaves those sections out.
- Contracts come from `@devdigest/shared`, aliased to `../server/src/vendor/shared`.

## Naming

- Files are kebab-case and named after the stage they own (`prompt.ts`,
  `grounding.ts`, `review/run.ts`, `output/to-review.ts`).
- Exported severity/verdict tables are SCREAMING_SNAKE (`SEV_RANK`,
  `SEVERITY_PENALTY`) and derive their keys from the contract enums.
- Tests mirror the source file name under `test/`.

## Do not touch

- `package-lock.json` — npm here, not pnpm; never hand-edited.
- `src/index.ts` exports as a casual rename — the server compiles against them.
- Runtime dependencies: adding one to a pure engine is a design change, not a fix.

## Gotchas

- Consumers use the **source**, so a type error here surfaces as a failing server
  typecheck and a triggered server CI lane, not as a failure in this package.
- Tests pass with no keys and no network by design; if a test needs either, the
  change being tested is in the wrong package.
