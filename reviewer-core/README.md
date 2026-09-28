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
  GROUND --> OUT["Review<br/>verdict · score · grounded findings"]
```

The grounding step is the mandatory gate: a finding that doesn't cite a real line
in the diff is dropped, so the engine can't hallucinate locations. The score is
recomputed deterministically from the **surviving** findings, not trusted from the
model. `review/run.ts` orchestrates the run (single-pass by default).

The engine also accepts optional prompt slots the **course lessons** start
feeding it — `skills` (L02), `intent` (L03, a pre-rendered untrusted string —
derivation itself stays in the server, see `server/docs/intent-in-prompt.md`),
`memory` (L07), `specs` (L05), `callers` — plus a `reduce()`/map-reduce path
and a `toReview()` CI payload helper used from L06. In the starter the server
passes only the diff, system prompt, and repo map; the extra slots are omitted,
so `assemblePrompt` simply leaves those sections out.

## Public API

Exported from `src/index.ts`: `assemblePrompt` / `wrapUntrusted` (prompt),
`groundFindings` / `groundingSummary` (grounding), `toJsonSchema` / `extractJson`
/ `parseWithRepair` (structured output), plus the `run` entrypoint and
`reduce` — including `scoreFromFindings`, the deterministic 0–100 score, which
the server reuses for the PR list so a row's SCORE cannot contradict the
findings counted next to it. Contracts (`Review`, `Finding`, `Verdict`, …) come
from `@devdigest/shared`.

`PromptParts.intent` and `ReviewInput.intent` (both `string | undefined`) are
the derived-intent slot: a pre-rendered, already-capped block the caller hands
in, rendered right after `## PR description` and wrapped `<untrusted
source="intent">` like every other repo- or author-derived section. This
package never derives intent itself — no DB, no LLM call for it, no knowledge
of `pr_intent` — it only formats the string it is given, the same contract as
`callers` and `repoMap`.

`AssembledPrompt.sections` (`PromptSectionMeta[]`) describes each section —
name, source, `wrapped`, `chars`, per-item sizes, `promptFingerprint` — without
its text; `ReviewInput.onPromptAssembled` receives it once per prompt sent. The
server logs it (`server/docs/prompt-logging.md`); the engine itself logs nothing.

## Testing

`npm test` (vitest) — hermetic units with a stubbed `LLMProvider`: prompt
assembly, the grounding gate, `toReview` selection, and a full `run`. No keys,
no network. `npm run typecheck` doubles as the build. See
[`../TESTING.md`](../TESTING.md).
