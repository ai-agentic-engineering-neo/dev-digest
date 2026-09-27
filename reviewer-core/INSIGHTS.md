# Insights — reviewer-core

Learnings for `@devdigest/reviewer-core`: prompt assembly, the grounding gate,
structured output, and keeping the engine pure.

**Fixed sections — append to the matching one, never to the bottom of the file.**
If an entry fits nowhere here, it probably belongs in `docs/` or nowhere at all.

How to write one: 1–3 lines, newest first inside its section, recording what a
careful reader could not have predicted from the code. Not a task log, not a
changelog, not a restatement of the diff. When an entry has bitten a third time,
promote it to `CLAUDE.md` — § Conventions for a pattern, § Gotchas for a trap —
and leave it here as history.

## What Works

Approaches and solutions that held up, with the context that made them work.

_None yet._

## What Doesn't Work

Dead ends and anti-patterns: what was tried, why it failed, what to do instead.
**The highest-value section and the one most often left empty. Fill it.**

_None yet._

## Codebase Patterns

Conventions and architectural decisions found while working here, before they are
settled enough to move into `CLAUDE.md`.

_None yet._

## Tool & Library Notes

Quirks of dependencies, versions and tooling — what a library does that its docs
do not say.

_None yet._

## Recurring Errors & Fixes

Error or symptom → cause → fix, one entry each, so the next occurrence is a lookup
instead of an investigation.

_None yet._

## Session Notes

Dated summaries as `### YYYY-MM-DD — topic`: what was worked on and what state it
was left in. Prune an entry once its content has moved into a section above.

_None yet._

## Open Questions

Unresolved behaviour, undecided design, unverified assumptions. Delete an entry when
it is answered — the answer belongs in another section.

- **Unverified: whether OpenRouter bills a generation the client gave up on — and the provider will give up and RE-SEND a long one up to three times.** (2026-09-23) `src/llm/openrouter.ts:52-55` builds the OpenAI SDK client with `timeout: 90_000, maxRetries: 2` and never reads `StructuredRequest.timeoutMs` (the OpenAI and Anthropic adapters in `server/` do honour it); the SDK retries on timeout, not just on 429/5xx. A real conventions scan took 68s, 75% of that ceiling.
  → Before changing it, confirm with one deliberately slow call whether the aborted attempts appear as charges in the OpenRouter dashboard. If they do, pass `{ timeout: req.timeoutMs }` per request and disable retry-on-timeout for long calls while keeping 429/5xx retries.
