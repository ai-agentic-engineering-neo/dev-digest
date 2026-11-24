# reviewer-core — `@devdigest/reviewer-core`

The pure review engine: diff → prompt → LLM → grounded findings. Repo-wide
rules are in [../CLAUDE.md](../CLAUDE.md); project overview in
[../README.md](../README.md); pipeline and public API in [README.md](README.md).
Do not repeat them here.

## Commands (npm, run from `reviewer-core/`)

```sh
npm test            # vitest, stubbed LLMProvider, no keys or network
npm run typecheck   # this is also the build; the package emits no JS
```

## Where things live

- `src/index.ts` — the public API; the server imports only from here
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — the citation gate
- `src/llm/structured.ts` — Zod → JSON Schema, parse-with-repair
- `src/llm/openrouter.ts` — the one concrete `LLMProvider`
- `src/review/run.ts` — `reviewPullRequest` orchestration; `reduce.ts` — map-reduce
- `src/output/to-review.ts` — CI payload helper (used from M6)

## Conventions

- Purity is the point: no database, GitHub, filesystem, env or clock access.
  The only side effect is the injected `LLMProvider`.
- New context reaches the model as an optional prompt slot on the input
  (`skills`, `memory`, `specs`, `callers` already exist). The server gathers the
  data; this package only formats it. An omitted slot must leave no trace in
  the prompt.
- Anything that originates from a PR or a repo goes through `wrapUntrusted`.
- Export new public symbols from `src/index.ts`.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`,
  never local copies.

## Gotchas

- `@devdigest/shared` resolves to `../server/src/vendor/shared` through a
  tsconfig alias. Changing a contract there can break this package.
- The server consumes this package as TypeScript source through its own alias,
  so a type error here fails the server's typecheck and tests too.
- The model's self-reported score is ignored; the score is recomputed from the
  findings that survive grounding. A finding with a wrong line is dropped, not
  corrected.
- Single-pass is the default strategy; map-reduce exists but the starter does
  not exercise it.

## Do not touch

- `INJECTION_GUARD` wording and the grounding rule — changing either weakens
  every review. Change only with a spec and tests that prove the new behaviour.
- Do not add a dependency on `server/` code other than the shared contracts.

## Read when

- Changing the pipeline or public API → read `README.md`.
- Adding a prompt slot or gate, or changing what the server passes in → read
  `docs/architecture.md`.
- Building a milestone change → read its spec in `specs/` (write it first).
- Editing reviewer system prompts → read `../docs/agent-prompts/README.md`.
- Writing tests → read `../TESTING.md`.
- Before starting → read `INSIGHTS.md`; treat it as high-confidence guidance.
- When a task ends or something non-obvious happens → run the
  `engineering-insights` skill (appends to `INSIGHTS.md`).
