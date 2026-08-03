# Examples

Worked patterns for [SKILL.md](SKILL.md). Drawn from `server/src` — including the
violations, which are real files as of 2026-08-02.

---

## 1. Constructor injection, not the container

### BAD — `modules/reviews/service.ts`

```ts
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }
}
```

Three problems in eight lines. The signature says the class needs "a container" —
which is to say, nothing and everything. It constructs its own `ReviewRepository`
from `container.db`, so persistence is hardwired rather than injected. And it
passes the whole container down to `ReviewRunExecutor`, propagating the problem
one ring deeper.

Same shape in `modules/repos/service.ts`, `modules/agents/service.ts`,
`modules/repo-intel/service.ts`.

### GOOD

```ts
export class ReviewService {
  constructor(
    private reviews: ReviewRepository,
    private agents: AgentsRepository,
    private executor: ReviewRunExecutor,
  ) {}
}
```

The signature is now the dependency list. A missing dependency is a type error at
the call site, not a crash in production.

Wiring moves to the composition root, which is the only place allowed to know
concrete classes:

```ts
// platform/container.ts
const reviewsRepo = new ReviewRepository(db);
const reviewService = new ReviewService(
  reviewsRepo,
  agentsRepo,
  new ReviewRunExecutor(llm, reviewsRepo, agentsRepo, runBus),
);
```

And the test stops needing a container at all:

```ts
// before: build a whole Container with overrides
const service = new ReviewService(makeContainer({ llm: fakeLlm, /* … */ }));

// after: pass what the test actually cares about
const service = new ReviewService(fakeReviewRepo, fakeAgentsRepo, fakeExecutor);
```

---

## 2. Routes are adapters

### BAD — `modules/settings/routes.ts`

```ts
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows);
  });
}
```

The HTTP adapter is running SQL. Three rings collapsed into one handler: there is
no service, no repository, and `drizzle-orm` is imported at the outermost edge.

Same in `modules/polling/routes.ts`, `modules/pulls/routes.ts`,
`modules/workspace/routes.ts`.

### GOOD

```ts
// modules/settings/repository.ts — persistence
export async function settingsFor(db: Db, workspaceId: string): Promise<SettingRow[]> {
  return db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
}

// modules/settings/service.ts — use case
export class SettingsService {
  constructor(private db: Db) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await settingsFor(this.db, workspaceId));
  }
}

// modules/settings/routes.ts — HTTP adapter, and nothing else
app.get('/settings', async (req) => {
  const { workspaceId } = await getContext(container, req);
  return container.settings.get(workspaceId);
});
```

The route now does exactly three things: get context, call one service method,
return. No `drizzle-orm` import anywhere in the file.

---

## 3. A repository that already gets it right

`modules/reviews/repository/run.repo.ts` is the reference — copy this shape.

```ts
/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; /* … */ }[]> {
  const rows = await db.select({ /* … */ }).from(t.agentRuns) /* … */;

  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}
```

Why it is right:

- **Business name.** `activeRunsForPull`, not `selectRunsWhere`.
- **Maps at the boundary.** Drizzle rows become a domain shape; `Date` becomes
  ISO string. No row type escapes.
- **Takes `db` as a parameter**, so the same function composes into a transaction
  (§5).
- **No rules inside.** It answers "which runs are running", not "may this run
  start".

### BAD — the leaky version

```ts
// Returns a Drizzle builder: the caller now depends on Drizzle's API
export function runsQuery(db: Db, workspaceId: string) {
  return db.select().from(t.agentRuns).where(eq(t.agentRuns.workspaceId, workspaceId));
}
```

The abstraction gives nothing — the caller must know Drizzle to use it. Delete it
or give it a business name and a domain return type.

---

## 4. Ports on the inside

### Structure

```
domain/ports/llm.ts          export interface LLMProvider { … }
adapters/llm/openai.ts       export class OpenAIProvider implements LLMProvider
adapters/llm/anthropic.ts    export class AnthropicProvider implements LLMProvider
```

```ts
// adapters/llm/openai.ts — the adapter imports the port
import type { LLMProvider } from '../../domain/ports/llm.js';

export class OpenAIProvider implements LLMProvider { … }
```

`domain/ports/llm.ts` imports nothing from `adapters/`. That is the inversion.

### The move

Today all seven ports live in `vendor/shared/adapters.ts`, which is a vendored
copy shared with the client. Measured 2026-08-02: **the client imports none of
them** — every reference is the definition itself in the client's own dead copy.

```
server/src/vendor/shared/adapters.ts  →  server/src/domain/ports/
client/src/vendor/shared/adapters.ts  →  delete (245 lines, zero consumers)
client/src/vendor/shared/index.ts     →  drop `export * from './adapters.js'`
```

`vendor/shared` keeps what it is actually for: API contracts crossing between
client and server.

---

## 5. Transactions owned by the use case

### BAD — repository owns the transaction

```ts
export async function createRunWithFindings(db: Db, run: NewRun, findings: NewFinding[]) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.agentRuns).values(run).returning();
    await tx.insert(t.findings).values(findings.map((f) => ({ ...f, runId: row.id })));
    return row;
  });
}
```

The repository cannot know which use case it takes part in, so it cannot know the
right boundary. Two such calls in one operation means two transactions where one
was needed.

### GOOD — service owns it, repositories accept the executor

```ts
// repository — `exec` is Db or a transaction; the function does not care
export async function insertRun(exec: Executor, run: NewRun): Promise<RunSummary> { … }
export async function insertFindings(exec: Executor, runId: string, f: NewFinding[]) { … }
```

```ts
// service — the use case defines the boundary
async completeRun(run: NewRun, findings: NewFinding[]): Promise<RunSummary> {
  return this.db.transaction(async (tx) => {
    const saved = await insertRun(tx, run);
    await insertFindings(tx, saved.run_id, findings);
    return saved;
  });
}
```

```ts
// db/client.ts
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
```

**Never hold a transaction across an external call:**

```ts
// NO — the LLM call holds a Postgres connection open for seconds
await this.db.transaction(async (tx) => {
  const findings = await this.llm.review(diff);   // ← external
  await insertFindings(tx, runId, findings);
});

// YES — call out first, commit after
const findings = await this.llm.review(diff);
await this.db.transaction(async (tx) => insertFindings(tx, runId, findings));
```

---

## 6. Validate at the boundary

### GOOD — the existing schema-first convention

```ts
app.post('/reviews/:id/run', {
  schema: { params: IdParams, body: RunRequest },
}, async (req) => {
  // req.params.id and req.body are already parsed and typed.
  return container.reviews.run(req.params.id, req.body);
});
```

Invalid input 422s before the handler runs.

### BAD — re-validating inside

```ts
async run(id: string, body: unknown) {
  const parsed = RunRequest.parse(body);   // ← the boundary is not trusted
}
```

If a service parses, either the route is missing its schema or someone does not
believe the boundary works. Fix the boundary; do not add a second one.

### Every edge, not just HTTP

```ts
// adapters/llm/openai.ts — an LLM response is untrusted input
const raw = await this.client.chat.completions.create(…);
return FindingsPayload.parse(JSON.parse(raw.choices[0].message.content ?? '{}'));
```

Parsing happens in the adapter. What reaches the domain is already a domain type.

---

## 7. Enforcement

The config lives at [`server/.dependency-cruiser.cjs`](../../../server/.dependency-cruiser.cjs)
— read it there rather than from a copy here, which would drift. Six rules:

| Rule | Enforces |
|---|---|
| `no-circular` | no import cycles |
| `domain-depends-on-nothing` | §1 — `src/domain/` imports nothing outward |
| `routes-are-adapters` | §5 — `routes.ts` never touches `db/` or `drizzle-orm` |
| `no-container-in-services` | §4 — no Service Locator |
| `db-only-in-repositories` | §6 — persistence access, incl. row types, stays in repositories |
| `no-cross-module` | §10 — modules compose in the container |

### It is a ratchet, not a warning

All six are `severity: 'error'`. The 20 pre-existing violations are recorded in
`.dependency-cruiser-known-violations.json` and skipped via `--ignore-known`, so:

- CI is green today
- a **new** violation fails the build immediately
- the baseline only ever shrinks

```
pnpm arch            # the gate: fails on anything not baselined
pnpm arch:all        # everything, baseline included — the real backlog
pnpm arch:baseline   # regenerate after fixing a violation
pnpm arch:graph      # SVG dependency graph (needs graphviz)
```

Commit the baseline file. It is the record of what is grandfathered; if it is
missing, every existing violation fails the build.

### Two options that matter

- **`tsPreCompilationDeps: true`** — required. Without it `import type` edges are
  invisible, and several of the real violations here are type-only, including
  four of the five cycles.
- **`exclude`** skips `src/vendor/` (vendored copies, not ours to restructure)
  and `*.test.ts` (tests legitimately reach across rings).

`no-cross-module` uses group matching — `([^/]+)` captured in `from`, referenced
as `$1` in `to.pathNot` — so a module may import itself but not a sibling.
`_shared` is exempt.

### CI

Runs as a step in the `typecheck` job of
[`.github/workflows/server-unit.yml`](../../../.github/workflows/server-unit.yml),
not as its own job: depcruise resolves through the
`@devdigest/reviewer-core → ../reviewer-core/src` tsconfig alias, so it needs the
reviewer-core deps that job already installs.
