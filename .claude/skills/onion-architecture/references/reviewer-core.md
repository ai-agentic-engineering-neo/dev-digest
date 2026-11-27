# reviewer-core — the centre of the onion

`reviewer-core` is the purest code in the repo: diff + agent inputs + an injected
`LLMProvider` → grounded `Review`. It is consumed as raw TypeScript by the server (path
alias) and by the CI agent-runner, so it must run anywhere.

## Rules
- **No DB, GitHub, filesystem, network, `process.env` or clock-dependent behaviour** that isn't injected. The only side effect is `LLMProvider` (a port from `@devdigest/shared`).
- **Public API = `src/index.ts`.** The server imports `@devdigest/reviewer-core`, never `reviewer-core/src/<file>`. There are no server-side re-export shims any more — change code here.
- **A new capability that needs I/O** (e.g. fetching callers, memory, skills) is **not** implemented here. Define the data as an input slot (`PromptParts`), or define a new port that the server's application layer implements and passes in.
- **Grounding is a domain invariant.** Findings must cite real diff lines; the score is recomputed from surviving findings. Never weaken or bypass it from the server.
- **Every untrusted block** goes through `wrapUntrusted()` during prompt assembly.
- `OpenRouterProvider` lives here as an adapter for the CI runner's convenience; treat it as ring 4 code that happens to sit in this package — the engine functions depend only on the `LLMProvider` interface.

## How the server uses it
`modules/reviews/run-executor.ts` (ring 3) loads the diff and agent config via ports,
resolves an `LLMProvider` from the container, calls `reviewPullRequest(...)`, and persists
the outcome via repositories. reviewer-core never knows a database exists.

## Testing
Pure unit tests with `MockLLMProvider`-style fakes (`npm test`); `npm run typecheck` is the
build. A type error here breaks the server too.
