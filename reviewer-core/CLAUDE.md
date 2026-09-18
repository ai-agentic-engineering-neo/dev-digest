# reviewer-core (`@devdigest/reviewer-core`) — agent notes

**npm, not pnpm.** This package has its own `package-lock.json`.

## Commands

```sh
npm test           # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck  # tsc --noEmit — this IS the build; the package emits no JS
```

## Conventions

- **Purity is the contract.** No database, no GitHub, no filesystem. The only side
  effect is an LLM call through an **injected** `LLMProvider`. Anything that needs I/O
  belongs in `server/`, not here.
- Consumed as TypeScript source through a tsconfig path alias. Never add a build step
  or import from `dist`.
- The public surface is whatever `src/index.ts` exports. Adding an export is an API
  change; check `server/` consumers first.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.
- Untrusted content (diffs, PR bodies) must be fenced with `wrapUntrusted()` +
  `INJECTION_GUARD` before it reaches the prompt.
- Output shape is enforced out-of-band (`response_format: json_schema, strict: true`).
  A system prompt must **not** describe JSON shape, markdown layout, an alternate
  severity scale, or a "max N findings" quota — all four degrade output.

## Gotchas

- **The grounding gate is mandatory.** A finding that does not cite a real line in
  the diff is dropped. Do not add a bypass — it is what stops hallucinated locations.
- The `score` is **recomputed deterministically** from the surviving findings
  (`scoreFromFindings`). **`verdict` is currently passed through unvalidated** from
  the model — which is why the verdict wording in a system prompt is load-bearing.
- `assemblePrompt` accepts optional slots (`skills`, `memory`, `specs`, `callers`)
  that the starter does not fill. An omitted slot renders as no section.

## Read when

- Read `insights.md` first for what was already tried here, and append to it at the
  end of the task when something non-obvious came up.
- Read `README.md` for the pipeline diagram and the full public API.
- Read `docs/` before changing prompt assembly or the grounding heuristics.
- Read `../docs/agent-prompts/` when the task concerns a built-in agent's system
  prompt or model choice.
