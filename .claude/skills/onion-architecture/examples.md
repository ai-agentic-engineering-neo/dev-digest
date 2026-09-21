# Onion Architecture (Backend) — Examples

Concrete before/after examples for each rule in [SKILL.md](SKILL.md). All
examples use dev-digest's real module shape
(`server/src/modules/<name>/{routes,service,repository,helpers,constants}.ts`)
and the existing `shared/adapters.ts` + `container.ts` pattern.

---

## Adding a New External Integration (e.g. a Slack notifier)

```ts
// BAD: service.ts reaches for the SDK directly — not inverted, not mockable
// server/src/modules/notifications/service.ts
import { WebClient } from '@slack/web-api';

export class NotificationService {
  private slack = new WebClient(process.env.SLACK_TOKEN);

  async notifyReviewDone(reviewId: string) {
    await this.slack.chat.postMessage({ channel: '#reviews', text: `Review ${reviewId} done` });
  }
}
```

```ts
// GOOD: port first, concrete implementation behind it, wired through the container

// 1. server/src/vendor/shared/adapters.ts — the port
export interface NotificationClient {
  postMessage(channel: string, text: string): Promise<void>;
}

// 2. server/src/adapters/notifications/slack.ts — the concrete implementation
import { WebClient } from '@slack/web-api';
import type { NotificationClient } from '@devdigest/shared';

export class SlackNotificationClient implements NotificationClient {
  private client = new WebClient(process.env.SLACK_TOKEN);
  async postMessage(channel: string, text: string) {
    await this.client.chat.postMessage({ channel, text });
  }
}

// 3. server/src/adapters/mocks.ts — the test double
export class MockNotificationClient implements NotificationClient {
  sent: { channel: string; text: string }[] = [];
  async postMessage(channel: string, text: string) {
    this.sent.push({ channel, text });
  }
}

// 4. server/src/platform/container.ts — the wiring. Note the async getter
// shape, matching container.github()/container.llm() — this is the real
// convention, not a same-line `new` in the constructor.
export class Container {
  private _notifications?: NotificationClient;

  async notifications(): Promise<NotificationClient> {
    if (this.overrides.notifications) return this.overrides.notifications;
    if (this._notifications) return this._notifications;
    const token = await this.secrets.get('SLACK_BOT_TOKEN');
    this._notifications = new SlackNotificationClient(token);
    return this._notifications;
  }
}

// 5. server/src/modules/notifications/service.ts — depends on the port, not
// the SDK. Takes the whole Container (the real convention ReviewService and
// RepoService use) and pulls the port off it via the async getter, rather
// than taking `NotificationClient` directly in the constructor — a service
// that takes individual ports one by one doesn't match how existing modules
// are wired and makes adding a second dependency an API-breaking change.
export class NotificationService {
  constructor(private container: Container) {}

  async notifyReviewDone(reviewId: string) {
    const notifications = await this.container.notifications();
    await notifications.postMessage('#reviews', `Review ${reviewId} done`);
  }
}
```

`NotificationService` now never imports `@slack/web-api`. A unit test injects
`MockNotificationClient` through `ContainerOverrides` exactly the way
existing tests inject a mock `LLMProvider` or `GitHubClient` — no network
call, no real Slack token needed.

### Calling this service from another module

`ReviewRunExecutor` (in the `reviews` module) needs to call
`NotificationService.notifyReviewDone` when a run finishes. This skill's
guidance doesn't cover cross-module calls as their own layer, so use this
rule: instantiate the callee at the call site with `new NotificationService(
this.container)`, the same way `RepoService` constructs `RepoRepository`
directly rather than through a shared registry. Reserve a container-level
facade getter (like `container.repoIntel`) for a subsystem with several
independent consumers — a single caller doesn't need one.

```ts
// server/src/modules/reviews/run-executor.ts
import { NotificationService } from '../notifications/service.js';

export class ReviewRunExecutor {
  private notifications: NotificationService;

  constructor(private container: Container, /* ...other deps... */) {
    this.notifications = new NotificationService(container);
  }

  private async onRunComplete(/* ... */) {
    // Best-effort — a Slack outage must never fail the review run.
    void this.notifications
      .notifyReviewDone(reviewId)
      .catch((err) => logger?.warn({ err }, 'notifications: failed to post'));
  }
}
```

---

## A Repository Type Leaking Past the Service Boundary

```ts
// BAD: service.ts returns the raw Drizzle row — the domain layer now
// depends on the database schema's shape
// server/src/modules/repos/service.ts
import type { RepoRow } from './repository.js';

export class RepoService {
  async get(id: string): Promise<RepoRow> {          // ← leaks $inferSelect outward
    return this.repository.findById(id);
  }
}
```

```ts
// GOOD (this is what dev-digest's repos module actually does): the
// repository owns the raw row type, the service maps it to the shared
// domain type before it crosses the boundary
// server/src/modules/repos/repository.ts
type RepoRow = typeof t.repos.$inferSelect;           // raw type stays local to this file

export class RepoRepository {
  async findById(id: string): Promise<RepoRow> { /* ... */ }
}

// server/src/modules/repos/helpers.ts
import type { Repo } from '@devdigest/shared';         // the Zod-derived domain type

export function toRepoDto(row: RepoRow): Repo {
  return { id: row.id, fullName: row.fullName, /* ... */ };
}

// server/src/modules/repos/service.ts
export class RepoService {
  async get(id: string): Promise<Repo> {               // ← public signature is domain-typed
    const row = await this.repository.findById(id);
    return toRepoDto(row);
  }
}
```

The rule isn't "never import Drizzle's inferred types" — `repository.ts` is
allowed to. The rule is that the **mapping happens before the value leaves
the module's infrastructure layer**, so nothing downstream (routes, other
modules, the client via `shared`) ever has to know the database's column
shape.

---

## Business Logic Sitting in the Wrong Layer

```ts
// BAD: routes.ts decides business rules inline
// server/src/modules/reviews/routes.ts
app.post('/reviews', async (req, reply) => {
  const { repoId, prNumber } = req.body;
  const repo = await repoService.get(repoId);
  if (repo.reviewCount > 100 && !repo.isPremium) {     // ← business rule, wrong layer
    return reply.code(402).send({ error: 'upgrade required' });
  }
  const review = await reviewService.create(repoId, prNumber);
  return reply.send(review);
});
```

```ts
// GOOD: routes.ts stays transport-only, the rule lives in service.ts
// server/src/modules/reviews/service.ts
export class ReviewService {
  async create(repoId: string, prNumber: number) {
    const repo = await this.repos.get(repoId);
    if (repo.reviewCount > 100 && !repo.isPremium) {
      throw new QuotaExceededError(repoId);             // ← domain-meaningful error
    }
    return this.repository.create(repoId, prNumber);
  }
}

// server/src/modules/reviews/routes.ts
app.post('/reviews', async (req, reply) => {
  try {
    const review = await reviewService.create(req.body.repoId, req.body.prNumber);
    return reply.send(review);
  } catch (err) {
    if (err instanceof QuotaExceededError) return reply.code(402).send({ error: 'upgrade required' });
    throw err;
  }
});
```

`ReviewService.create` can now be unit-tested with a plain object standing in
for `repos`/`repository` — no Fastify `inject()`, no HTTP status codes inside
the test.

---

## `reviewer-core/` as the Reference Domain Center

```ts
// reviewer-core/ never does this — importing a DB/GitHub client/filesystem
// would break the "pure engine" guarantee the whole package exists for
import { drizzle } from 'drizzle-orm/node-postgres'; // ← would never appear here
import { readFileSync } from 'node:fs';                // ← would never appear here
```

```ts
// what it actually does: the only side effect is one call through an
// injected port, exactly like this skill's Application-layer rule
export async function review(diff: Diff, provider: LLMProvider): Promise<Review> {
  const prompt = buildPrompt(diff);
  const raw = await provider.complete(prompt);           // ← the one injected side effect
  return groundFindings(raw, diff);                        // pure, testable without a real LLM call
}
```

When someone asks "what does a correctly-onioned application/domain layer
look like in this repo," point them at `reviewer-core/` directly — it's not
a hypothetical example, it's the shipping package.
