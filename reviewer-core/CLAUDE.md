# reviewer-core — pure review engine (diff → prompt → LLM → grounded findings)

## Commands (npm)
npm test · npm run typecheck (= build; the package never emits JS)

## Layout
src/index.ts             public API — export everything through here
src/review/run.ts        reviewPullRequest(): single-pass | map-reduce → reduce → grounding
src/prompt.ts            assemblePrompt, wrapUntrusted, INJECTION_GUARD
src/grounding.ts         groundFindings — drops findings not on a real diff line
src/llm/                 structured output (Zod → JSON Schema, parse-with-repair), OpenRouter provider
src/output/to-review.ts  CI payload helper (used from L06)

## Rules
- NO I/O: no DB, fs, GitHub, env. The only side effect is the injected LLMProvider.
- Contracts come from @devdigest/shared (../server/src/vendor/shared); don't redefine types here.
- zod is pinned to this package's node_modules via tsconfig paths — keep it.
- Optional prompt slots (skills, memory, specs, callers, repoMap): empty → section omitted.
- Tests stub LLMProvider; no keys, no network.
- server consumes this as source → changes here also trigger server-unit CI.

## Do not touch (without an explicit ask)
- INJECTION_GUARD semantics; never add keyword/denylist filtering of untrusted text.
- The grounding gate and score recomputation from kept findings (model's score is ignored by design).

## Read when
- Pipeline overview → README.md · prompt conventions → ../docs/agent-prompts/README.md
- Designing engine changes → specs/ · background notes → docs/
- Before any change → read INSIGHTS.md (engineering-insights skill)
