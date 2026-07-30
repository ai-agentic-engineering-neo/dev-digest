# reviewer-core/CLAUDE.md — `@devdigest/reviewer-core`

Pipeline diagram, public API: [README.md](README.md). This file only adds what
an agent working in this folder wouldn't guess from the README.

Read [LEARNINGS.md](LEARNINGS.md) before starting work here — treat it as
high-confidence guidance unless it's obviously stale.

## Non-default conventions

- Pure engine: no DB, GitHub, or filesystem access — the **only** side effect
  allowed is an LLM call through the injected `LLMProvider`. Don't add direct
  I/O; it breaks mock-testability.
- The package never emits JS — `build` is a type-check only. The server
  consumes `src/*` directly via a tsconfig path alias (tsx in dev, vitest in
  tests), not a compiled `dist`.
- Optional prompt slots (`skills` L02, `memory` L07, `specs` L05, `callers`)
  are accepted by `assemblePrompt` but currently unused — the starter passes
  only diff/system-prompt/repo-map. When wiring a new slot, keep it optional:
  `assemblePrompt` must still work with the slot omitted.

## Do-not-touch

- `groundFindings` (`grounding.ts`) — the mandatory citation gate; a finding
  without a real diff-line citation must be dropped, and the score
  recomputed from survivors, never trusted from the model's self-report.
- `INJECTION_GUARD` (`prompt.ts`) — one shared, trusted defense appended to
  every agent's system prompt. Don't add per-agent or keyword-based
  injection scanning; the guard's premise is that untrusted content is
  treated as data regardless of what it claims to be.

## Gotchas

- `@devdigest/shared` here resolves to **server's** `vendor/shared`
  (`../server/src/vendor/shared`), not client's — the two copies have
  drifted (see root `CLAUDE.md`); don't assume a contract change here also
  reaches the client.
- No `.env`, no keys, no network in tests — `LLMProvider` is always a stub in
  `test/`. If a test needs real network behavior, it belongs in `server`'s
  integration suite, not here.

## Testing

`npm test` (vitest) — hermetic units with a stubbed `LLMProvider`. `npm run
typecheck` doubles as the build.

## Read when

- Where this engine sits in the run lifecycle, and who calls it:
  [../docs/architecture.md](../docs/architecture.md).
- Testing/CI questions: [../TESTING.md](../TESTING.md).
- How `assemblePrompt` builds an agent's system prompt: [../docs/agent-prompts](../docs/agent-prompts/).
- Building a feature that has a spec: [../specs/](../specs/) — also the future
  source for the `specs` prompt slot (L05).

Finishing a substantive task here (bug fix, non-trivial change, discovery)?
Append an entry to [LEARNINGS.md](LEARNINGS.md) — don't skip it.
