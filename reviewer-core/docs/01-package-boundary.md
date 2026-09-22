# The boundary, and what it buys

This package is defined more by what it cannot reach than by what it does.

[`../README.md`](../README.md) is the map: the pipeline diagram and the public API list live there
and are not repeated. This file explains the two constraints the root
[`CLAUDE.md`](../../CLAUDE.md) states as rules — *openai + zod only, no DB, no GitHub, no FS* and
*ships TS source, never JS* — as the decisions they are, and what each one costs and pays for.

## One consumer today, two by design

In this repository the server is the only thing that imports the engine
(`server/tsconfig.json:24`). The second consumer — a runner that executes the same review inside
GitHub Actions — is not here yet; it arrives in a later lesson
(`reviewer-core/README.md:7-9`), and the package's own description already names both
(`reviewer-core/package.json:6`).

That absent consumer is why the boundary looks over-strict for a package with one caller. Everything
the engine needs is handed to it:

- **The model call.** `reviewPullRequest` never constructs a provider; it calls the one in
  `input.llm` (`reviewer-core/src/review/run.ts:174`). The package does ship an implementation
  (`reviewer-core/src/llm/openrouter.ts`), because both consumers need the same one, but the engine
  function has no way to reach it on its own.
- **The price table.** Cost attribution is an injected function, not a lookup the engine owns
  (`reviewer-core/src/llm/openrouter.ts:35`) — the studio passes its own price book, and the CI
  runner passes nothing and gets `null` (`reviewer-core/src/llm/openrouter.ts:107`).
- **Cancellation.** The engine calls a `checkCancelled` callback that the caller supplies and that
  throws the caller's own error type (`reviewer-core/src/review/run.ts:164`), so aborting a run
  needs no knowledge of the server's `RunCancelledError`.
- **Progress.** Events go to an injected `onEvent` sink (`reviewer-core/src/review/run.ts:127`),
  not to a logger the package chose.

**What a database or a filesystem would cost.** The runner executes in a GitHub Actions container:
no Postgres, no `~/.devdigest/secrets.json`, no clone of the studio's schema. An engine that read a
row or a file would either have to be reimplemented there or drag a database into CI to review a
pull request. The same constraint is what keeps the tests honest — `pnpm test` runs the whole
pipeline against a stubbed provider with no keys and no network (`reviewer-core/README.md:47-49`),
which is only possible because there is nothing else to stub. The package's whole source tree
contains no `node:` import, no `process.env` read and no filesystem call; the grep that proves it is
the cheapest way to check the rule still holds.

## Ships TS source, never JS

The `build` script is `tsc --noEmit` — the same command as `typecheck`
(`reviewer-core/package.json:8-9`), and the config sets `noEmit: true` with `declaration: false`
(`reviewer-core/tsconfig.json:18` and `:15`). Nothing is emitted, ever.

The server reaches the source directly through a path alias that ends in a `.ts` file
(`server/tsconfig.json:24`), and runs it under `tsx`, which compiles on the fly. So the package has
no artefact and no publish step, and there is no window in which a stale `dist/` can disagree with
`src/`. That is the whole point: with two consumers on different schedules, a built artefact is a
third thing to keep in sync, and the one most likely to be forgotten.

The cost is that the package's import style is dictated by its consumer, not by itself. Relative
imports here carry `.js` while the files are `.ts` (`reviewer-core/src/llm/openrouter.ts:10`),
because the server runs the result as real ESM under Node. `moduleResolution` is `Bundler`
(`reviewer-core/tsconfig.json:5`), so `tsc` will not enforce that extension — a missing `.js` type-
checks green here and fails at run time over in the server.

**This does not have to be reconciled with the client's bundler, because the client never sees this
package.** Only `server/tsconfig.json` aliases `@devdigest/reviewer-core`; the client aliases only
`@devdigest/shared`, its own vendored copy of the contracts. The `.js`-specifier problem that the
client solves with `resolve.extensionAlias`
([`../../client/docs/01-ui-architecture.md`](../../client/docs/01-ui-architecture.md)) is the same
problem arriving by a different route — through the vendored contracts, not through the engine.

## Untrusted content is fenced, not filtered

Which slots the server fills, and which stay empty, is covered in
[`../../server/docs/01-review-run.md`](../../server/docs/01-review-run.md). What matters here is how
each one is treated once it arrives.

Two mechanisms, both applied unconditionally by `assemblePrompt`:

1. **A guard appended to every system prompt** (`reviewer-core/src/prompt.ts:86`). It states that
   anything inside `<untrusted>` delimiters is data, and that claims of "test fixture", "intentional",
   "demo" or "do not flag" — in any language — never descope the review
   (`reviewer-core/src/prompt.ts:16-28`). Because it is appended inside the engine, it cannot be
   forgotten by a consumer or disabled by an agent's own prompt.
2. **Delimiter wrapping with escape stripping.** `wrapUntrusted` fences the content and replaces any
   `</untrusted>` inside it (`reviewer-core/src/prompt.ts:32`), so content cannot close the fence
   that contains it and continue as instructions.

The split between wrapped and unwrapped is a trust judgement, not an oversight:

| Slot | Fenced | Why |
|---|---|---|
| `diff` | yes (`reviewer-core/src/prompt.ts:120`) | authored outside this repository |
| `prDescription` | yes, and truncated to 4000 chars (`reviewer-core/src/prompt.ts:107`) | author-controlled, a prime injection vector |
| `specs` | yes (`reviewer-core/src/prompt.ts:96`) | repository content, so attacker-influenceable by a PR |
| `repoMap` | yes (`reviewer-core/src/prompt.ts:112`) | derived from repository code |
| `callers` | yes (`reviewer-core/src/prompt.ts:117`) | derived from repository code |
| `skills` | no (`reviewer-core/src/prompt.ts:88`) | curated by the workspace owner |
| `memory` | no (`reviewer-core/src/prompt.ts:90`) | curated by the workspace owner |
| `system`, `task` | no | written by the operator, not by any input |

The line is *who authored it*, not *where it is stored*: a spec file living in the repository is
fenced, while a skill body configured in the studio is not. A new slot inherits nothing — it is
unfenced until someone wraps it, so the question to answer when adding one is which side of that
line it falls on. The defence is deliberately a single stated rule rather than keyword scanning; a
denylist only ever catches the phrasing someone thought of.

## A large diff takes a different path, and the score notices

`selectMode` picks the path (`reviewer-core/src/review/run.ts:115-121`). Under the default `auto`
strategy, map-reduce is chosen only when the diff is **both** over 400 changed lines
(`reviewer-core/src/review/run.ts:30`) **and** spread over more than one file — one enormous file
still goes in a single call, because splitting it would buy nothing.

In map-reduce the engine makes one model call per file and merges the partials
(`reviewer-core/src/review/reduce.ts:43`): findings concatenate, the worst verdict wins
(`reviewer-core/src/review/reduce.ts:46-49`), and the scores are **averaged**
(`reviewer-core/src/review/reduce.ts:50-52`). That mean is where the number in the run log comes
from — the one the server-side document notes is never stored. It is a mean of self-reported
numbers, computed only because `reduceReviews` has to return a complete `Review`, and it is
overwritten a few lines later by the deterministic score
(`reviewer-core/src/review/run.ts:208`). Reading it as a quality signal is reading an intermediate.

One more asymmetry belongs to this path. The prompt assembly recorded for the trace is the
**whole-diff** assembly, built once before the loop (`reviewer-core/src/review/run.ts:142`) and
overwritten only on the single-pass path (`reviewer-core/src/review/run.ts:173`). In map-reduce the
trace therefore shows a prompt that was assembled but never sent: the real calls each carried one
file's slice. It is the right summary to show a human and the wrong thing to reason about token
counts from.

## Invalid model output is repaired, then given up on

Structured output is enforced twice, by different mechanisms.

First at the provider: the request sets `response_format: json_schema` with `strict: true`
(`reviewer-core/src/llm/openrouter.ts:74-77`), so the schema is imposed before a token is generated.
Second in the engine: `parseWithRepair` validates whatever came back
(`reviewer-core/src/llm/structured.ts:54`).

The parse is two-stage, and the order is deliberate. `JSON.parse` on the raw text runs first, and
only if that throws does it fall back to extracting a fenced or brace-balanced region
(`reviewer-core/src/llm/structured.ts:61-65`). The comment records why: the extractor can be fooled
by ``` fences or `{` braces that appear *inside* a JSON string value, which is a real shape for a
finding whose rationale contains a markdown code block.

On failure the caller does not simply retry the same request. It appends the model's own bad output
as an assistant turn and the specific complaint as a user turn
(`reviewer-core/src/llm/openrouter.ts:112-113`), where the complaint is built from the Zod issues,
path by path (`reviewer-core/src/llm/structured.ts:76-83`). The model is shown what it wrote and
what was wrong with it.

The budget is `maxRetries + 1` attempts, defaulting to **three**
(`reviewer-core/src/llm/openrouter.ts:61` and `:68`; the engine's own default is set at
`reviewer-core/src/review/run.ts:32`). Two consequences follow:

- **A repaired call is not free.** Tokens accumulate across attempts rather than resetting
  (`reviewer-core/src/llm/openrouter.ts:94-95`), and the conversation grows by two messages each
  time, so the third attempt carries the first two. The run's recorded cost includes all of it, and
  the returned `attempts` count is the only way to tell a clean call from an expensive one
  (`reviewer-core/src/llm/openrouter.ts:109`).
- **Exhaustion throws** (`reviewer-core/src/llm/openrouter.ts:115`). There is no partial result and
  no empty review: the error propagates to the caller, which is how a malformed-output run becomes a
  `failed` row rather than a review with zero findings. A separate guard does the same for an HTTP
  200 that carries no choices at all (`reviewer-core/src/llm/openrouter.ts:89-91`).

## The grounding gate lives here

It is worth saying plainly, because the server-side document describes the gate in the middle of a
server flow and can leave the impression that the server owns it. It does not.
`groundFindings` is defined in this package (`reviewer-core/src/grounding.ts:52`) and called from
this package (`reviewer-core/src/review/run.ts:197`), before the outcome is ever returned. What the
server has is a six-line re-export shim kept so older import paths still resolve
(`server/src/platform/grounding.ts:6`).

The consequence is the one that matters for the second consumer: a review produced in CI passes the
identical gate, with the identical exemptions, without the runner implementing anything. The same
holds for the score and the injection guard. Moving any of the three out of this package would mean
maintaining it twice and discovering the divergence in production.

## What is not here

| For | Go to |
|---|---|
| The pipeline at a glance and the exported API | [`../README.md`](../README.md) |
| Which prompt slots the server fills, and what a run persists | [`../../server/docs/01-review-run.md`](../../server/docs/01-review-run.md) |
| What an agent's system prompt should say; severity and verdict semantics | [`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md) |
| The two drop reasons and the four exempt kinds, as a standing rule | root [`CLAUDE.md`](../../CLAUDE.md) § *Gotchas* |
| How findings are rendered and triaged | [`../../client/docs/01-ui-architecture.md`](../../client/docs/01-ui-architecture.md) |
| Repo-intel: how `repoMap` and `callers` are built before they arrive here | [`../../server/src/modules/repo-intel/README.md`](../../server/src/modules/repo-intel/README.md) |
