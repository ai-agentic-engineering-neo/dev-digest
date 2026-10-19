# Testing by ring

Onion makes each ring testable with the cheapest tool that can break it.
`TESTING.md` (root) is the source of truth for suites, naming and CI; this file
only says which ring gets which test.

| Ring | Test type | Tools | File |
|------|-----------|-------|------|
| Domain | unit, pure | vitest, no setup | `test/<m>-domain.test.ts` |
| Application (service) | unit with **fakes of ports** | vitest, hand-written in-memory fakes or `adapters/mocks.ts` | `test/<m>-service.test.ts` |
| Outbound adapter (repository) | integration, real Postgres + pgvector | testcontainers (`test/helpers/pg.ts`) | **must** be `*.it.test.ts` |
| Inbound adapter (routes) | HTTP-level | `app.inject` + `ContainerOverrides` | smoke in unit lane; DB-backed in `*.it.test.ts` |
| Whole flow | e2e | agent-browser (`e2e/`) | — |

## Fakes over mocks for ports

A fake is a tiny working implementation (Fowler, *Mocks Aren't Stubs*):

```ts
class InMemoryNoteStore implements NoteStore {
  private notes = new Map<string, NoteRecord>();
  async get(ws: string, id: string) {
    const n = this.notes.get(id);
    return n?.workspaceId === ws ? n : undefined;
  }
  async insert(n: Omit<NoteRecord, 'id' | 'createdAt'>) {
    const rec = { ...n, id: crypto.randomUUID(), createdAt: new Date() };
    this.notes.set(rec.id, rec);
    return rec;
  }
  // …
}

const jobs = { enqueue: vi.fn(async () => ({})) };
const service = new NotesService({ store: new InMemoryNoteStore(), jobs });
```

Assert on **outcomes** (returned DTO, store state, enqueued job), not on call
order. Because `implements NoteStore` is type-checked, a fake can't silently
drift from the port.

## Rules

- A service test must not need Docker, network or keys. If it does, a port is
  missing.
- Repository tests prove the SQL, mapping and tenancy scoping against a real
  DB — don't fake Drizzle.
- Don't re-test business branches through HTTP; route tests cover status
  codes, validation (422), serialization and error mapping.
- The fake UoW runs `work(fakeRepos)` directly; rollback is covered by one
  `*.it.test.ts` against real Postgres.
