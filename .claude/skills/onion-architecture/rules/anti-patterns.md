# Anti-patterns to flag in review

Concrete violations, what they break, and the fix — for reviewing PRs or your own work in `server`/`reviewer-core`.

## 1. A route querying Drizzle directly

```ts
// ❌ in routes.ts
app.get('/pulls/:id/reviews', async (req) => {
  return db.select().from(reviews).where(eq(reviews.prId, req.params.id));
});
```

**Breaks:** presentation now depends on infrastructure directly, skipping application. Business rules (workspace scoping, DTO shaping) either get duplicated across every route that needs this data, or silently omitted.
**Fix:** route calls `service.reviewsForPull(workspaceId, prId)`; `service.ts` calls `repo.reviewsForPull(prId)`. Compare with the real `reviewsRoutes`/`ReviewService.reviewsForPull` pair in `modules/reviews/`.

## 2. `service.ts` importing a framework or SDK type

```ts
// ❌ in service.ts
import type { FastifyRequest } from 'fastify';
import type OpenAI from 'openai';

async function runReview(req: FastifyRequest) { ... }
```

**Breaks:** the application layer can no longer be called from anywhere but an HTTP handler (or tested without constructing a fake `FastifyRequest`), and it's now coupled to one LLM SDK's shape instead of the `LLMProvider` port.
**Fix:** `service.ts` methods take plain typed parameters (`workspaceId: string`, `prId: string`) extracted by the route, and depend on `LLMProvider`/`CodeHostClient`/etc. from `@devdigest/shared`, never the SDK behind them.

## 3. Anemic service — a `service.ts` that's just a pass-through to `repository.ts`

```ts
// ❌
class FooService {
  async getFoo(id: string) { return this.repo.getFoo(id); }  // ...and every method is exactly this
}
```

**Breaks:** not a hard rule violation, but a sign the layer split may be adding indirection without adding value — or that business rules that *should* exist got skipped. Not every module needs meaningful application logic (some really are near-CRUD), but if you're extracting a `service.ts` purely to satisfy the pattern with zero orchestration/validation/business-rule content in it, ask whether `routes.ts` calling `repository.ts` directly for that one endpoint (with the seam left in place for when logic does appear) is more honest than a hollow layer. Don't force ceremony where there's no orchestration to do yet.

## 4. Port interface defined inside `adapters/` instead of `@devdigest/shared`

```ts
// ❌ server/src/adapters/github/octokit.ts
export interface CodeHostClient { ... }   // defined next to its ONE implementation
export class OctokitGitHubClient implements CodeHostClient { ... }
```

**Breaks:** anything importing the port to depend on it (a `service.ts`, `container.ts`, a test stub) now imports from the adapter's own folder — meaning "depend on the abstraction" and "depend on the GitHub adapter" look identical from the import line, and swapping to GitLab means touching every import site instead of one factory in `container.ts`.
**Fix:** interface goes in `server/src/vendor/shared/adapters.ts` (see the real `CodeHostClient`, `LLMProvider`, etc. there); the adapter file only has `implements PortName`.

## 5. Fat route — business branching in `routes.ts`

```ts
// ❌
app.post('/pulls/:id/review', async (req) => {
  if (req.body.all && workspace.plan === 'free') {
    throw new AppError('plan_limit', 'Upgrade to run all agents', 403);
  }
  // ...
});
```

**Breaks:** a business rule (plan limits) now lives where only request-shape validation should, untestable without spinning up Fastify, and invisible to anything else that might need the same rule (a background job, a CLI).
**Fix:** the rule moves into `service.ts` (`resolveTargets` or similar), and the route stays a translation layer. Compare with the real `resolveTargets` in `ReviewService`, which already owns "which agents should this run target" as an application-layer decision.

## 6. Reaching for `.it.test.ts` to make an application-layer test pass

Covered in depth in [testing-strategy.md](testing-strategy.md) — treat "this business-logic test needs a real database" as a symptom to investigate, not a fact to accommodate.

## 7. Skipping the port for a "just this once" shortcut

```ts
// ❌ in service.ts, "just for this one debug endpoint"
import { Octokit } from '@octokit/rest';
const octokit = new Octokit({ auth: token });
```

**Breaks:** every exception like this is invisible until the day you actually need to swap or mock that dependency, at which point it's a surprise. The container/port indirection exists precisely so "swap the LLM provider" or "mock GitHub in tests" is a one-file change — one exception erodes that guarantee silently.
**Fix:** even for a small/debug/one-off use, go through the existing port (`container.github`) or add the missing method to it if the port doesn't cover this case yet.
