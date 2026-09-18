# Case study: `reviewer-core` as a working onion core

`reviewer-core` is the best reference in this repo for "what does a correctly-layered core actually look like" — it wasn't built by following this skill (the skill was written by reading it), which is exactly why it's a trustworthy example rather than a contrived one.

## The shape

```
reviewer-core/src/
  prompt.ts          Domain: assemblePrompt / wrapUntrusted — pure string assembly
  grounding.ts        Domain: groundFindings — pure citation-gate business rule
  review/
    run.ts            Application: reviewPullRequest — orchestrates domain + the one port
    reduce.ts          Domain: reduceReviews, scoreFromFindings, sliceDiff — pure
  llm/
    openrouter.ts       Infrastructure: OpenRouterProvider implements LLMProvider
    structured.ts        Infrastructure-adjacent: Zod → JSON Schema, parse-with-repair
  output/
    to-review.ts        Application: toReview — CI payload shaping
  index.ts             Public API surface — the package's own "presentation" boundary
```

There's no `modules/` slicing because the package *is* one bounded use-case (review a PR). Compare that to `server`, which has many use-cases (`pulls`, `reviews`, `agents`, `repos`, ...) and therefore slices vertically per feature — same architecture, different scale.

## Tracing one call

`reviewPullRequest(input: ReviewInput)`:

1. **Application** (`review/run.ts`) receives `input.diff`, `input.systemPrompt`, and `input.llm: LLMProvider` — a port, not a class.
2. It calls **domain** `assemblePrompt(...)` (`prompt.ts`) — pure, builds the message list.
3. It calls the **port** `input.llm.completeStructured(...)` — the single I/O seam in the whole call.
4. It calls **domain** `reduceReviews(...)` (`reduce.ts`) — pure, merges map-reduce partials.
5. It calls **domain** `groundFindings(...)` (`grounding.ts`) — pure, the mandatory citation gate; nothing downstream can accidentally skip it because it's not optional in `run.ts`'s control flow.
6. It returns a plain `ReviewOutcome` object — no class instances, no SDK types, safe for any caller (CI runner, studio server) to consume.

At no point does `run.ts` know or care whether `input.llm` is `OpenRouterProvider`, a test stub, or (hypothetically) a direct Anthropic client. That's the Dependency Rule, observed in a 220-line file rather than a diagram.

## Two things worth noticing precisely because they look like exceptions

**The adapter lives inside the "pure" package.** `llm/openrouter.ts` uses the `openai` SDK directly and does real network I/O — that's infrastructure code, full stop. It living inside `reviewer-core` doesn't violate the architecture, because `run.ts` still only depends on the `LLMProvider` interface, never on `OpenRouterProvider` the class. `server`'s `container.ts` imports `OpenRouterProvider` from `@devdigest/reviewer-core` as one of several `LLMProvider` implementations it can wire up — from `server`'s point of view, `reviewer-core` exports both a port-consuming core *and* one convenient default adapter for it, and `server` is free to use a different one (`OpenAIProvider`, `AnthropicProvider`) without touching `reviewer-core` at all.

**"Optional prompt slots... exist for later course lessons."** (from `reviewer-core/AGENTS.md`) — `assemblePrompt` accepts `skills`, `memory`, `specs`, `callers` as optional parameters that the current caller doesn't populate. This is a reminder that Onion Architecture's payoff isn't just swappability of infrastructure — it's that the domain/application core can grow capability (new optional inputs) without any outer layer needing to change until it's ready to use them. A `service.ts` that only imports a port's interface, not its implementation, gets this same property for free.

## What to imitate when writing new pure logic

If you're adding a new business rule anywhere in `server` and wondering how "pure" it should be, hold it up against `groundFindings`: does it take plain data in, return plain data out, and would its unit test still pass if you deleted every adapter in the codebase? If yes, you've written it correctly regardless of which file it lives in.
