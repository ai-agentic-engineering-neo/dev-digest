# reviewer-core — agent map

`@devdigest/reviewer-core`: the review engine. diff -> prompt -> LLM ->
grounded findings. The pipeline diagram and the public API are in README.md.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer it —
then read code.

## Non-default conventions

- **Purity is the point.** No database, GitHub, filesystem or env access. The
  only side effect is the injected `LLMProvider`. If a change needs I/O, it
  belongs in the server caller, not here.
- This package never emits JS. `build` is `tsc --noEmit`; the server consumes
  the TypeScript source directly through a path alias (tsx in dev, vitest in
  tests).
- Installs with **npm**, not pnpm.
- `@devdigest/shared` resolves to `../server/src/vendor/shared`. Editing a
  contract here changes the server too.
- Grounding is one shared gate applied after reduce — not per strategy. Keep it
  that way.
- The score is always recomputed from the findings that survived grounding. The
  model's self-reported score is ignored by design.
- `INJECTION_GUARD` in `src/prompt.ts` is the single trusted defense against
  prompt injection. Do **not** add keyword or denylist scanning of untrusted
  text: a denylist only ever catches one phrasing in one language.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`,
  `prDescription`) must stay omit-when-empty. Adding a slot must not change the
  assembled prompt when that slot is unused.

## Non-obvious behavior

- Every review path runs through `assemblePrompt` — the studio server today and
  the CI runner from L06. A wording change to the system prompt or the guard
  changes both at once; note the reasoning in `docs/` when you make one.
- Tests stub `LLMProvider`. There is no key and no network in this suite; keep
  it that way.

## Do-not-touch

- Nothing here is generated, but treat `INJECTION_GUARD` as a contract rather
  than ordinary prose.

## Read when

- Read `README.md` before changing the pipeline or the public API.
- Read `docs/pipeline.md` for the stage-by-stage walk-through (mode selection,
  prompt assembly, structured output, reduce, grounding, scoring).
- Read `specs/review-contract.md` before touching `reviewPullRequest`, the
  grounding gate or the score — both callers depend on what it states.
- Read `../docs/agent-prompts/` before editing reviewer system prompts.
- Read `../TESTING.md` before adding or changing a test.
- Read `INSIGHTS.md` before starting non-trivial work here.

Found a trap that cost you time? Capture it with the `engineering-insights`
skill, which appends it to `INSIGHTS.md`.
