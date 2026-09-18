# Domain layer: pure business rules

The domain layer is the innermost ring: entities, value objects, and the business rules that would still be true if you swapped Fastify for Express, Postgres for SQLite, or OpenRouter for Anthropic. It has **zero** dependencies on frameworks, SDKs, or I/O — not even the types.

Why this matters in practice, not just in theory: code with zero external dependencies is code you can unit-test with plain inputs and outputs, no mocks, no test containers, no network. It's also the code most likely to be reused (the CI runner and the studio server both call `reviewer-core`'s domain logic; neither would be possible if that logic imported a Fastify or Drizzle type).

Further reading:
- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [Clean Architecture with TypeScript: DDD, Onion — André Bazaglia](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)

## What this looks like in this repo

`reviewer-core/src/grounding.ts` is the clearest domain-layer example in the codebase. `groundFindings` is a business rule — *"a finding is only valid if its line range intersects a real diff hunk"* — expressed as a pure function:

```ts
// reviewer-core/src/grounding.ts
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  // ... pure logic over `findings` and `diff`, no I/O, no LLM call
}
```

Its only imports are `Finding` and `UnifiedDiff` types from `@devdigest/shared` — data shapes, not behavior. Given the same `findings` and `diff`, it always returns the same result. That's what makes it trustworthy as *the mandatory mechanical gate* the doc-comment describes: nothing about an LLM's mood or a flaky network connection can change its answer.

`reviewer-core/src/prompt.ts` (`assemblePrompt` / `wrapUntrusted`) is the same story: string-in, string-out, no side effects.

## Where domain logic lives in `server`

`server` doesn't have a dedicated domain folder or file-naming convention yet, because most of its modules are thin CRUD-over-Drizzle orchestration where there isn't much business logic beyond "fetch, check ownership, persist." When a module *does* grow real business rules (scoring, validation, a policy decision that doesn't need a DB row to evaluate), the fix isn't to invent a new folder — it's to:

1. Write it as a plain exported function, colocated in the module (e.g. `modules/<feature>/rules.ts` or inline near its single caller if small).
2. Keep its parameter and return types free of `FastifyRequest`, Drizzle `$inferSelect`/`$inferInsert` types, and any SDK type (`OpenAI.Chat...`, `Octokit...`).
3. Let `service.ts` be the thing that calls it and translates DB rows into the plain types it expects.

If you're not sure whether something needs its own file: if `service.ts` would shrink and gain a clear unit-testable function by extracting it, extract it. If it's three lines used once, leave it inline — don't split for the sake of splitting (see the repo's own principle: no premature abstraction).

## The litmus test

Before writing domain logic, ask: **"If I deleted every other file in this package except this one and its type dependencies, would this file still compile and its tests still pass?"** If the answer requires a database connection, an API key, or a running Fastify instance, it isn't domain logic yet — see [application-layer.md](application-layer.md) or [infrastructure-layer.md](infrastructure-layer.md) for where it belongs instead.
