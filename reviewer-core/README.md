# `@devdigest/reviewer-core` — the review engine

Pure review logic: **diff → prompt → LLM → grounded findings**. No database,
GitHub, or filesystem; the only side effect is an LLM call through an **injected**
`LLMProvider`, which is what makes it mock-testable.

In the starter the **server** (`@devdigest/api`) is its only consumer — for local
reviews in the studio. (The CI runner that runs the same engine in GitHub Actions
is added back in the Export-to-CI lesson, L06.) The server wires it via a tsconfig
path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`) and consumes the
TypeScript **source** directly (tsx in dev, vitest in tests). The package never
emits JS — its `build` is a type-check.

## Pipeline

```mermaid
flowchart LR
  IN["inputs<br/>diff · system prompt · repo map"] --> PROMPT["assemblePrompt()<br/>prompt.ts"]
  PROMPT --> WRAP["wrapUntrusted() + INJECTION_GUARD<br/>fence untrusted content vs prompt injection"]
  WRAP --> LLM["LLMProvider (injected)<br/>llm/openrouter.ts"]
  LLM --> STRUCT["structured output<br/>llm/structured.ts<br/>Zod → JSON Schema · parse-with-repair"]
  STRUCT --> GROUND["groundFindings()<br/>grounding.ts<br/>mechanical citation gate vs the diff"]
  GROUND --> SCOPE["applyScopePolicy()<br/>review/scope.ts<br/>normalizes out_of_scope — never drops/downgrades"]
  SCOPE --> OUT["Review<br/>verdict · score · grounded findings"]
```

The grounding step is the mandatory gate: a finding that doesn't cite a real line
in the diff is dropped, so the engine can't hallucinate locations. The score is
recomputed deterministically from the **surviving** findings, not trusted from the
model. `review/run.ts` orchestrates the run (single-pass by default).

The engine also accepts optional prompt slots the **course lessons** start
feeding it — `skills` (L02), `intent` (L03, `## PR intent`, spec
`server/specs/05-intent-layer.md`), `memory` (L07), `specs` (L05), `callers` —
plus a `reduce()`/map-reduce path and a `toReview()` CI payload helper used
from L06. In the starter the server passes only the diff, system prompt, repo
map, and (once L03 is enabled) intent; the extra slots are omitted, so
`assemblePrompt` simply leaves those sections out.

When `ReviewInput.intent` is set, `renderIntent()` turns it into the `## PR
intent` section's content, preceded by the trusted `INTENT_SCOPE_RULE` (a
derived-hint framing, never a limiter — `prompt.ts`). After grounding,
`applyScopePolicy()` normalizes each finding's `out_of_scope` flag: forced
`null` when no intent was supplied, otherwise coerced to a plain boolean —
the finding list's length, order and severities are never touched, so the
score is identical with or without an intent.

## Public API

Exported from `src/index.ts`: `assemblePrompt` / `wrapUntrusted` /
`renderIntent` / `INTENT_SCOPE_RULE` (prompt), `groundFindings` /
`groundingSummary` (grounding), `applyScopePolicy` (out-of-scope policy,
`review/scope.ts`), `toJsonSchema` / `extractJson` / `parseWithRepair`
(structured output), plus the `run` entrypoint and `reduce`. Contracts
(`Review`, `Finding`, `Intent`, `Verdict`, …) come from `@devdigest/shared`.

Robustness knobs (all optional, sane defaults):
- `reviewPullRequest`: `concurrency` (map chunks in flight, default 3, result
  order stays deterministic), `maxDiffChars` (per-chunk cap, default 200k — an
  oversize chunk is split by hunks, a single oversize hunk is truncated with an
  in-prompt note; both emit a `warning:` info event), `temperature` (default 0,
  `null` = provider default).
- `OpenRouterProvider`: `totalTimeoutMs` (one wall-clock budget per
  `completeStructured` shared by SDK retries AND schema reprompts, default 180s;
  the caller `signal` aborts it too), `listModelsTimeoutMs`, `onWarning`.
  Reasoning models (o-series, gpt-5*, deepseek-r1/reasoner) never get
  `temperature`. A response without `usage` is estimated (~4 chars/token) and
  warned about instead of booked as 0 tokens.

## Testing

`npm test` (vitest) — hermetic units with a stubbed `LLMProvider`
(`test/fixtures/`: `StubLLM` + pre-parsed diffs — tests never import server
code): prompt assembly, the grounding gate, `toReview` selection, and a full
`run`. No keys, no network. `npm run test:coverage` enforces v8 thresholds. `npm run typecheck` doubles as the build. See
[`../TESTING.md`](../TESTING.md).
