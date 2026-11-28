# Module template — copy to `server/src/modules/<name>/`

Replace `Note`/`note`/`notes` with your entity. Placeholders are marked `TEMPLATE:`.
Create only the folders that have content (see references/layers.md → "When to simplify").

```
<name>/
  domain-model/note.ts                 entity + rules (pure)
  domain-services/ports.ts             NoteStore, UnitOfWork, TxHandle (+ JobQueue / RunEvents if needed)
  application-services/create-note.ts  use case (constructor-injected ports)
  application-services/create-note.test.ts  unit test with in-memory fake
  infrastructure/note.drizzle-store.ts Drizzle implementation + toDomain mapper
  compose.ts                           composition root of the module (only Container consumer)
  routes.ts                            Fastify plugin: parse → use case → DTO
```
Then: register `routes.ts` in `src/modules/index.ts`, add the contract to `vendor/shared/contracts/`, run `pnpm typecheck`, unit tests, `pnpm arch:check`.
