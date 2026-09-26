# Intent Layer (reviewer-core)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `server/`, `reviewer-core/` and `client/`, so it keeps
**one** spec:
[../../server/specs/L03-intent-layer.md](../../server/specs/L03-intent-layer.md) —
goal, non-goals, contracts, routes, data sources, confidence rules and
acceptance criteria all live there.

This file records only what is reviewer-core-specific.

## Prompt slot

`src/prompt.ts` gains an optional `PromptIntent` slot on `PromptParts.intent`:

```ts
export interface PromptIntent {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: 'high' | 'medium' | 'low';
}
```

Rendered right after `## PR description` and before `## Skills / rules`,
wrapped in `<untrusted source="derived-intent">` and capped at
`MAX_INTENT_BLOCK_CHARS = 2000` chars. `low` confidence adds a "weak hint"
line. `assembly.intent` carries the rendered block (or `null`). When
`intent` is undefined the prompt is byte-identical to the pre-L03 baseline.

`src/review/run.ts` — `ReviewInput.intent?: PromptIntent`, passed through to
`promptParts` so every map-reduce chunk's prompt carries it too.

`PromptIntent` is exported from `src/index.ts`.

## Test plan

| File | Covers |
|------|--------|
| `test/prompt.test.ts` | placement, omission, cap, escaping, low-confidence hint |
| `test/run.test.ts` | map-reduce chunks all carry the intent section |
