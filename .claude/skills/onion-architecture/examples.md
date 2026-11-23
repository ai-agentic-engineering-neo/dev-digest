# Examples

Real server paths where possible. Snippets marked *(illustrative)* are proposals, not existing code. Source IDs resolve in [README.md](README.md).

Contents: [1. Fat route → rings](#1-fat-route--rings) · [2. Pure rule](#2-pull-the-rule-out-pure-and-tested) · [3. New integration](#3-adding-an-external-integration) · [4. Transaction](#4-atomic-multi-step-write) · [5. Error mapping](#5-errors-meaning-in-the-core-status-at-the-edge) · [6. New module](#6-new-module-labels) · [7. Right-sizing](#7-right-sizing)

---

## 1. Fat route → rings

**Today** — `modules/pulls/routes.ts`, `GET /repos/:id/pulls`: inside one handler it queries `t.repos` with Drizzle, calls `container.github()`, loops over GitHub PRs doing `container.db.insert(t.pullRequests)….onConflictDoUpdate(...)`, swallows sync errors, then reads and shapes the response.

❌ Adding "filter by author" means editing this handler: more SQL and more branching in the presentation ring, untestable without Fastify + Postgres.

✅ *(illustrative)* split along the rings; behaviour stays identical:

```ts
// routes.ts — presentation: translate
app.get('/repos/:id/pulls', { schema: { params: IdParams, querystring: PullsQuery } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listPulls(workspaceId, req.params.id, req.query);
});

// service.ts — application: orchestrate (ports + repository), degrade offline
async listPulls(workspaceId: string, repoId: string, q: PullsQuery): Promise<PrMeta[]> {
  const repo = await this.repos.getInWorkspace(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  await this.trySyncFromGitHub(repo);            // uses the GitHubClient port; logs and continues on failure
  const rows = await this.pulls.listForRepo(workspaceId, repo.id, { author: q.author });
  return rows.map((r) => toPrMeta(r, …));        // pure mapping in helpers.ts
}

// pulls.repository.ts — infrastructure: the only place with Drizzle
async upsertMany(workspaceId: string, repoId: string, prs: PullRequestInput[], tx?: Tx) { … }
async listForRepo(workspaceId: string, repoId: string, f: { author?: string }) { … }
```
Why: the rule "which PRs match a filter" is now a repository argument; the offline-tolerant sync is a service method you can test with `MockGitHubClient`; the route is 3 lines. [O1][O3][F2]

Do this only when the task is already in that code. Otherwise add the filter minimally and note the debt.

---

## 2. Pull the rule out, pure and tested

`pulls/status.ts` is the model: `deriveReviewStatus({ … })` and `rollupSeverities(rows)` take plain data and return plain data.

```ts
// ✅ helpers.ts — pure, no Container, no db
export const canAutoMerge = (s: { blocking: number; score: number | null }, minScore: number) =>
  s.blocking === 0 && s.score !== null && s.score >= minScore;

// helpers.test.ts — no mocks, no async
expect(canAutoMerge({ blocking: 0, score: 82 }, 80)).toBe(true);
```
```ts
// ❌ the same rule hidden in a handler or SQL
.where(and(eq(t.reviews.blocking, 0), gte(t.reviews.score, minScore)))   // business rule encoded in a query
```
If a rule needs the clock or randomness, pass `now` in as an argument. [O1][O4]

---

## 3. Adding an external integration

Request: *"post the review summary to Slack."* *(illustrative)*

```
vendor/shared/adapters.ts          export interface NotificationSink { postReviewSummary(s: ReviewSummary): Promise<void> }   ← port (core's language)
adapters/slack/slack-sink.ts       class SlackNotificationSink implements NotificationSink   ← the ONLY file importing the Slack SDK; reads token via SecretsProvider; wraps errors in ExternalServiceError
adapters/mocks.ts                  class MockNotificationSink implements NotificationSink    ← records calls
platform/container.ts              get notifications(): NotificationSink { return this.overrides.notifications ?? (this._n ??= new SlackNotificationSink(this.secrets)); }
                                   + `notifications?: NotificationSink` in ContainerOverrides
modules/reviews/service.ts         await this.container.notifications.postReviewSummary(summary)   ← no SDK import
test/…                             const sink = new MockNotificationSink(); buildApp({ config, overrides: { notifications: sink } }) → expect(sink.calls).toHaveLength(1)
```
❌ `import { WebClient } from '@slack/web-api'` in `reviews/service.ts` — now the application ring needs a Slack token and network in every test. [H1][H2][O1b]

---

## 4. Atomic multi-step write

Today there is no `db.transaction(` in `server/src`. When a use case must write several things together: *(illustrative)*

```ts
// service.ts — the use case decides the boundary
await this.container.db.transaction(async (tx) => {
  const review = await this.reviews.insert(input, tx);
  await this.reviews.insertFindings(review.id, findings, tx);
  await this.runs.markDone(runId, tx);
});

// repository.ts — takes an optional executor
async insert(input: NewReview, tx?: Tx) {
  const db = tx ?? this.db;
  const [row] = await db.insert(t.reviews).values(…).returning();
  return row;
}
```
Keep LLM/GitHub calls **outside** the transaction (do the call, then open a short transaction to persist). [D2][S1][O3]

---

## 5. Errors: meaning in the core, status at the edge

```ts
// service.ts (application) — no HTTP knowledge beyond the shared error class
const agent = await this.agents.find(workspaceId, id);
if (!agent) throw new NotFoundError('Agent not found');

// adapters/github/octokit.ts (infrastructure) — translate the vendor error
try { return await this.octokit.rest.pulls.list(…); }
catch (e) { throw new ExternalServiceError('GitHub request failed', { cause: String(e) }); }

// app.ts (presentation) — the one place that maps errors to the envelope (already exists)
if (err instanceof AppError) reply.status(err.statusCode).send({ error: { code, message, details } });
```
❌ `reply.status(404).send(...)` inside a service, or letting an Octokit/Postgres error reach the handler. [O4]

---

## 6. New module: `labels`

Request: *"add labels; a PR can have at most 5."* *(illustrative)*

```
modules/labels/
├── routes.ts        zod params/body; getContext; service.add(workspaceId, prId, name)
├── service.ts       loads current labels via repository, applies the rule, persists
├── repository.ts    list/insert/delete — all Drizzle, workspace-scoped
├── helpers.ts       export const MAX_LABELS = 5 (or constants.ts); canAddLabel(current: number): boolean  (+ helpers.test.ts)
└── constants.ts     MAX_LABELS
modules/index.ts     + import labels from './labels/routes.js'; + entry in the registry
test/labels.it.test.ts   repository + route against Postgres (name must end .it.test.ts)
```
`canAddLabel` is a domain function with a plain unit test; the 422/409 comes from throwing the shared error class in the service, mapped by `app.ts`. No `domain/` folder or `ports.ts` — there is nothing to put in them yet. [G1][K1]

---

## 7. Right-sizing

❌ Over-built: `domain/Label.ts` entity class, `ports.ts` with `LabelRepository` interface (one implementation, no fake), `LabelMapper`, `LabelUseCase` — for a CRUD list with one rule.

✅ `routes → service → repository` plus one pure function. Add `ports.ts` the day a service needs a fake in a no-Docker unit test, or a second implementation appears. The **direction** of dependencies is non-negotiable; the **amount of structure** is proportional to the logic. [G1][K1]
