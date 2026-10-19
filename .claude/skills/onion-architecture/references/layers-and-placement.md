# Layers & placement — a full module, end to end

Worked example: a new `notes` module (CRUD + one real invariant), written the
target way. Use it as the template; copy the *shape*, not the names.

## File by file

### `ports.ts` — what the service needs (owned by the application)

```ts
import type { NoteStatus } from './domain.js';

/** Read model the service works with — NOT a Drizzle row. */
export interface NoteRecord {
  id: string;
  workspaceId: string;
  body: string;
  status: NoteStatus;
  createdAt: Date;
}

export interface NoteStore {
  get(workspaceId: string, id: string): Promise<NoteRecord | undefined>;
  list(workspaceId: string): Promise<NoteRecord[]>;
  insert(note: Omit<NoteRecord, 'id' | 'createdAt'>): Promise<NoteRecord>;
  updateStatus(workspaceId: string, id: string, status: NoteStatus): Promise<void>;
}

/** Narrow slice of JobRunner the service actually uses. */
export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}
```

Rule of thumb: a port is shaped by **what the use case needs**, not by what the
table or SDK offers (Fowler, *DIP in the Wild*). Don't mirror every column or
every SDK method.

### `domain.ts` — only because there IS an invariant

```ts
export type NoteStatus = 'draft' | 'published' | 'archived';

export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class NoteTransitionError extends DomainError {
  constructor(from: NoteStatus, to: NoteStatus) {
    super('note_invalid_transition', `Cannot move a note from ${from} to ${to}`);
  }
}

const ALLOWED: Record<NoteStatus, NoteStatus[]> = {
  draft: ['published', 'archived'],
  published: ['archived'],
  archived: [],
};

/** The rule lives here, once — services call it, they don't re-implement it. */
export function transition(from: NoteStatus, to: NoteStatus): NoteStatus {
  if (!ALLOWED[from].includes(to)) throw new NoteTransitionError(from, to);
  return to;
}
```

No zod, no Drizzle, no `AppError` (it carries an HTTP status), no platform
imports. If a second module needs `DomainError`, promote it to
`modules/_shared/domain-error.ts` — still framework-free.

A CRUD-only module would **not** have this file.

### `service.ts` — use cases, explicit deps

```ts
import type { Note } from '@devdigest/shared';
import type { NoteStore, JobQueue } from './ports.js';
import { transition, type NoteStatus } from './domain.js';
import { toNoteDto } from './helpers.js';
import { NOTE_PUBLISHED_JOB } from './constants.js';

export interface NotesDeps {
  store: NoteStore;
  jobs: JobQueue;
}

export class NotesService {
  constructor(private readonly deps: NotesDeps) {}

  async list(workspaceId: string): Promise<Note[]> {
    return (await this.deps.store.list(workspaceId)).map(toNoteDto);
  }

  async create(workspaceId: string, body: string): Promise<Note> {
    const note = await this.deps.store.insert({ workspaceId, body, status: 'draft' });
    return toNoteDto(note);
  }

  /** Returns undefined when the note does not exist — the route maps that to 404. */
  async changeStatus(workspaceId: string, id: string, to: NoteStatus): Promise<Note | undefined> {
    const note = await this.deps.store.get(workspaceId, id);
    if (!note) return undefined;
    const status = transition(note.status, to); // throws a DomainError
    await this.deps.store.updateStatus(workspaceId, id, status);
    if (status === 'published') {
      await this.deps.jobs.enqueue(workspaceId, NOTE_PUBLISHED_JOB, { id });
    }
    return toNoteDto({ ...note, status });
  }
}
```

Note what is absent: `Container`, `db`, `drizzle-orm`, `fastify`,
`new NoteRepository(...)`, secrets.

Not-found handling: either return `undefined` (as above) and let the route
decide, or throw a domain `NotFound`-style error with a `code`. Legacy services
throw `NotFoundError` from `platform/errors` — acceptable when editing them, not
for new modules.

### `helpers.ts` — pure mapping

```ts
import type { Note } from '@devdigest/shared';
import type { NoteRecord } from './ports.js';

export function toNoteDto(n: NoteRecord): Note {
  return {
    id: n.id,
    workspace_id: n.workspaceId,
    body: n.body,
    status: n.status,
    created_at: n.createdAt.toISOString(),
  };
}
```

Takes the **read model**, not `typeof t.notes.$inferSelect` (that is the legacy
shape — see `repos/helpers.ts`).

### `repository.ts` — outbound adapter

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NoteRecord, NoteStore } from './ports.js';
import type { NoteStatus } from './domain.js';

type NoteRow = typeof t.notes.$inferSelect;

const toRecord = (r: NoteRow): NoteRecord => ({
  id: r.id,
  workspaceId: r.workspaceId,
  body: r.body,
  status: r.status as NoteStatus,
  createdAt: r.createdAt,
});

export class NoteRepository implements NoteStore {
  constructor(private readonly db: Db) {}

  async get(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(t.notes)
      .where(and(eq(t.notes.workspaceId, workspaceId), eq(t.notes.id, id)));
    return row && toRecord(row);
  }
  // list / insert / updateStatus …
}
```

`implements NoteStore` makes the compiler check the adapter against the port.
Every query stays workspace-scoped (tenancy guard, existing convention).

### `compose.ts` — module composition root

```ts
import type { Container } from '../../platform/container.js';
import { NotesService } from './service.js';
import { NoteRepository } from './repository.js';

export function createNotesService(c: Container): NotesService {
  return new NotesService({
    store: new NoteRepository(c.db),
    jobs: c.jobs,
  });
}
```

If another module needs the store, promote it to a lazy getter on `Container`
(as `agentsRepo` / `reviewRepo` already are) instead of importing this file
from the other module.

### `routes.ts` — inbound adapter

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NoteInput, NoteStatusInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { createNotesService } from './compose.js';
import { toHttpError } from './http-errors.js';

export default async function notesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = createNotesService(app.container);

  app.post('/notes', { schema: { body: NoteInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.status(201);
    return service.create(workspaceId, req.body.body);
  });

  app.post(
    '/notes/:id/status',
    { schema: { params: IdParams, body: NoteStatusInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      try {
        const note = await service.changeStatus(workspaceId, req.params.id, req.body.status);
        if (!note) throw new NotFoundError('Note not found');
        return note;
      } catch (err) {
        throw toHttpError(err);
      }
    },
  );
}
```

`http-errors.ts` (module-local, inbound side):

```ts
import { AppError } from '../../platform/errors.js';
import { DomainError } from './domain.js';

const STATUS: Record<string, number> = { note_invalid_transition: 409 };

export function toHttpError(err: unknown): unknown {
  if (err instanceof DomainError) {
    return new AppError(err.code, err.message, STATUS[err.code] ?? 400);
  }
  return err;
}
```

Then register the plugin in `modules/index.ts` (static registration — repo
rule).

## Dependency graph of the module

```
routes.ts ──► compose.ts ──► repository.ts ──► drizzle-orm, src/db
    │             │                │
    │             ▼                ▼ implements
    └──────► service.ts ──────► ports.ts ◄── domain.ts (types)
                  │
                  └──────► domain.ts, helpers.ts
```

Nothing points from `service.ts`/`domain.ts` back out.

## Small-module shortcut

For a tiny read-only module (one or two queries, no rules) it is fine to have
`routes.ts → service.ts → repository.ts` with the store interface declared at
the top of `service.ts` instead of a separate `ports.ts`. What is *not* fine,
even for small modules: Drizzle in `routes.ts`, or the service taking `Container`.
