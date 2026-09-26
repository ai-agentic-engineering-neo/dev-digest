# Safe structured logging of prompt assembly (reviewer-core)

**Status:** in-progress
**Lesson / ticket:** L03

The feature spans `server/` and `reviewer-core/`, so it keeps **one** spec:
[../../server/specs/L03-prompt-logging.md](../../server/specs/L03-prompt-logging.md) —
goal, non-goals, the full record contract and acceptance criteria all live
there.

This file records only what is reviewer-core-specific.

## `promptTelemetry` / `sections` API

`assemblePrompt(parts, opts?: { fingerprint?: (text: string) => string })`
returns an `AssembledPrompt` with a new `sections: PromptSection[]` field —
one entry per section actually rendered (`system_prompt`, `injection_guard`,
then each user section in push order), each carrying
`name/source/role/untrusted/chars/tokens_est` and a `fingerprint` **only**
when `opts.fingerprint` is supplied.

`ReviewInput.promptTelemetry?: PromptTelemetryOptions` lets a caller observe
one `PromptAssembledInfo` per assembled prompt (`scope:'run'` once per
`reviewPullRequest`, plus `scope:'chunk'` per LLM call in map-reduce when
`detail === 'verbose'`) via `onPrompt`. Every `onPrompt` invocation is
wrapped in try/catch inside reviewer-core and any error is swallowed —
telemetry must never fail a review.

**Metadata only; the hasher is injected.** reviewer-core never imports
`node:crypto` or any other `node:` module. The fingerprint function is
supplied by the caller (the server, via `PromptTelemetryOptions.fingerprint`)
and reviewer-core never sees or logs section text — only the metadata table
above.

## Test plan

| File | Covers |
|------|--------|
| `test/prompt.test.ts` | `sections` shape/order/chars, fingerprint opt-in, `messages`/`assembly` unchanged |
| `test/run.test.ts` | `promptTelemetry.onPrompt` called once (`scope:'run'`) in single-pass, once + N chunk records in map-reduce verbose, swallowed `onPrompt` errors |
