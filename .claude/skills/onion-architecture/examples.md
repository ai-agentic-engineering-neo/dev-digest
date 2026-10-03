# Onion Architecture — examples

## Compliant: `repo-intel` (`routes.ts → service.ts → repository.ts`)

`routes.ts` never touches Drizzle — it resolves tenancy and delegates:

```ts
// server/src/modules/repo-intel/routes.ts
app.get(
  '/repos/:id/index-state',
  { schema: { params: IdParams } },
  async (req): Promise<IndexState> => {
    await getContext(container, req);
    return container.repoIntel.getIndexState(req.params.id);
  },
);
```

`service.ts` owns the business rule (degrade gracefully instead of
throwing) and delegates persistence to the repository — it never imports
`drizzle-orm` or `db/schema.js` itself:

```ts
// server/src/modules/repo-intel/service.ts
async getIndexState(repoId: string): Promise<IndexState> {
  const persisted = await this.repo.tryGetIndexState(repoId);
  if (persisted) return persisted;
  return { repoId, status: 'degraded', filesIndexed: 0, /* ... */ };
}
```

`repository.ts` is the *only* file in the module that imports Drizzle:

```ts
// server/src/modules/repo-intel/repository.ts
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class RepoIntelRepository {
  // ... all container.db / t.symbols / t.references access lives here
}
```

`reviews/` follows the same three-file split, but splits `repository.ts`
into `repository/{pull,review,run}.repo.ts` because the module owns three
distinct aggregates (see [SKILL.md](SKILL.md) §3).

## Anti-pattern: `pulls/routes.ts` (no service, no repository)

The handler imports Drizzle directly, mixes GitHub-sync business logic into
the HTTP layer, and calls `container.db` inline — three ring violations in
one file:

```ts
// server/src/modules/pulls/routes.ts — current state, NOT to be copied
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');

  // ... GitHub client fetch, then an upsert loop against container.db
  // directly inside the handler:
  for (const pr of pulls) {
    await container.db
      .insert(t.pullRequests)
      .values({ /* ... */ })
      .onConflictDoUpdate({ /* ... */ });
  }

  const rows = await container.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo.id));
  // ...
});
```

Per [SKILL.md](SKILL.md) §2, this crosses the threshold the moment
`container.db` appears in the handler. The fix shape (not applied by this
skill — flagged as known debt) is the same split `repo-intel` already
uses:

- `pulls/repository.ts` — `findRepo`, `upsertPullRequests`, `listPullRequests`
  (all the `container.db`/`t.pullRequests`/`t.repos` access, moved verbatim)
- `pulls/service.ts` — `PullsService.syncAndList(repoId)`: calls the GitHub
  adapter (via `container.github()`), then the repository's upsert +
  read, keeping the "local-first, sync best-effort" business rule out of
  the HTTP layer
- `pulls/routes.ts` — shrinks to `getContext` + one call into the service

`settings/routes.ts`, `polling/routes.ts`, and `workspace/routes.ts` have
the same shape of violation (direct `container.db` calls, no
repository/service layer) at a smaller scale.
