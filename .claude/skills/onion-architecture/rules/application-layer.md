# Application layer: use-case orchestration

The application layer answers "what happens when this use-case runs" — it sequences calls to domain logic and to ports, without itself performing I/O. In this repo that's `service.ts` inside each `server/src/modules/<feature>/`, and `reviewer-core/src/review/run.ts` for the review engine itself.

Its defining property: **it depends on interfaces (ports), never on the concrete class that implements them.** That's what lets `reviewer-core/review/run.ts` be called identically from the CI GitHub Action and from the studio server — it never knows or cares whether `LLMProvider` is backed by OpenRouter, OpenAI, or a test stub.

## Reference: `reviewPullRequest` (reviewer-core)

```ts
// reviewer-core/src/review/run.ts
export interface ReviewInput {
  systemPrompt: string;
  model: string;
  diff: UnifiedDiff;
  llm: LLMProvider;          // ← a PORT, injected — not `new OpenRouterProvider(...)`
  strategy?: ReviewStrategy;
  // ...
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  // orchestrates: assemblePrompt (domain) → input.llm.completeStructured (port call)
  //             → reduceReviews (domain) → groundFindings (domain, the mandatory gate)
  // performs NO I/O beyond the one injected call
}
```

Notice what it does *not* import: no `OpenRouterProvider`, no `fetch`, no environment variables. The caller decides which `LLMProvider` to hand it. That's the whole pattern in one function signature.

## Reference: `ReviewService` (server)

```ts
// server/src/modules/reviews/service.ts
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  async runReview(workspaceId: string, prId: string, targets: AgentRow[], logger?: Logger) {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    // ... create run rows, kick off `this.executor.executeRuns(...)` in the background
  }
}
```

`ReviewService` takes the whole `Container` and pulls out `repo`, `agents`, and hands them to `executor` — this is DI via a container rather than one-interface-per-constructor-arg (see [dependency-injection.md](dependency-injection.md) for why that's the right tradeoff here). What makes it application-layer, not infrastructure, is that it never writes a SQL-ish query itself — every DB access goes through `this.repo`, every LLM call goes through the executor's injected provider. Read `ReviewService` and you understand *what* a review run does; you'd have to open `repository.ts` or `run-executor.ts` to see *how*.

## Where to define a new port

If a `service.ts` needs a new capability that requires I/O, the port interface for it belongs in `server/src/vendor/shared/adapters.ts` (alongside `LLMProvider`, `CodeHostClient`, `GitClient`, etc.) — **not** inside `server/src/adapters/`. This matters more than it looks: defining the interface in `@devdigest/shared` (central, framework-agnostic) rather than next to one implementation keeps the application layer's import graph pointing at a neutral contract instead of at a specific vendor's folder — which is exactly what makes swapping that vendor a one-file change later (`platform/container.ts`) instead of a `service.ts` rewrite.

`server/src/vendor/shared` is a do-not-touch-lightly path (synced/vendored — see the repo's root `CLAUDE.md`), so a new port there is a deliberate, reviewed addition, not something to add casually for a one-off need.

## Common shape

```
async function useCase(input: DomainInput, ports: { thePort: PortInterface }): Promise<DomainOutput> {
  const validated = someDomainRule(input);        // domain call — pure
  const raw = await ports.thePort.doTheThing(validated); // port call — the ONE I/O seam
  return anotherDomainRule(raw);                   // domain call — pure
}
```

Everything that isn't a domain call or a port call in a `service.ts` is a smell — it means infrastructure logic leaked inward. See [anti-patterns.md](anti-patterns.md).

Further reading:
- [Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS — DEV Community](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)
