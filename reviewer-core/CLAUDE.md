# CLAUDE.md — `@devdigest/reviewer-core`

> **Load this file when** you are working inside `reviewer-core/` — editing prompt assembly, grounding logic, structured output, or the LLM provider. Also load it when working on the review pipeline in `server/modules/reviews/` (run-executor, diff-loader), since that code is the caller of this engine.
>
> For non-obvious design decisions and known gotchas in this package, read [`insights.md`](./insights.md). For deeper architecture notes or ADRs, check [`docs/`](./docs/). For behavioural specs, check [`specs/`](./specs/).

This file provides guidance to Claude Code when working inside `reviewer-core/`.

## Package role

Pure review engine: **diff → prompt → LLM → grounded findings**. No DB, no GitHub, no filesystem. The only side effect is an LLM call through an injected `LLMProvider`. Consumed by `server/` via tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`). Never emits JS — `npm run build` is a type-check.

## Commands

```sh
npm test           # vitest, hermetic — no keys, no network
npm run typecheck  # also the "build"
```

## Source layout

```
src/
  index.ts          public API surface — everything the server imports
  prompt.ts         assemblePrompt(), wrapUntrusted(), INJECTION_GUARD
  grounding.ts      groundFindings(), groundingSummary()
  llm/
    openrouter.ts   OpenRouterProvider (default LLM adapter)
    structured.ts   toJsonSchema(), extractJson(), parseWithRepair()
  review/
    run.ts          reviewPullRequest() — single-pass orchestrator
    reduce.ts       map-reduce path (multi-file / multi-agent)
    to-review.ts    toReview() — CI payload helper (M6+)
  output/           (structured output helpers, internal)
```

## Pipeline

```
assemblePrompt(diff, systemPrompt, repoMap?, skills?, memory?)
  → wrapUntrusted() — fences all untrusted content (diff, PR body, comments)
  → appends INJECTION_GUARD to system prompt
  → LLMProvider.complete()
  → parseWithRepair() — JSON Schema from Zod, repair malformed JSON
  → groundFindings() — drops findings with no matching diff line
  → recompute score from surviving findings
  → Review { verdict, score, findings }
```

## Critical invariants

**Grounding is mandatory.** Every finding must cite a line that exists in the diff — `groundFindings()` drops anything that doesn't match. The score is then recomputed from the surviving set; the model's self-reported score is ignored. Never bypass this gate.

**INJECTION_GUARD is the prompt-injection defense.** It tells the model that all untrusted content (diff, PR body, comments, README) is data — never instructions — and that "intentional / test / do not flag" claims inside the diff never descope a real defect. Do not keyword-scan untrusted text; the guard is deliberate and covers all phrasings.

**parseWithRepair** tolerates partial JSON from the model (truncated or malformed). If repair fails, the run returns an empty findings array rather than crashing.

## Public API (exported from `src/index.ts`)

```ts
// Review entrypoint
reviewPullRequest(inputs, llmProvider): Promise<Review>

// Prompt assembly
assemblePrompt(inputs): string
wrapUntrusted(content, label): string

// Grounding
groundFindings(findings, diff): Finding[]
groundingSummary(original, grounded): string

// Structured output
toJsonSchema(zodSchema): JSONSchema
extractJson(text): string
parseWithRepair(text, schema): unknown

// CI helper
toReview(pullRequest): ReviewPayload
```

## Testing

Tests are hermetic: a stub `LLMProvider` returns fixed JSON, no network or keys required. Cover: prompt assembly (shape of output, presence of `INJECTION_GUARD`), grounding gate (findings with/without matching lines), `parseWithRepair` (valid, malformed, truncated), and a full `run` end-to-end with stubbed model.
