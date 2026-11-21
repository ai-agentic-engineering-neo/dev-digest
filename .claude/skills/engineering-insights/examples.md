# Examples

An entry must be actionable "cold": a reader with no context knows what to do, without re-investigating.

## Bad vs good

| Bad (noise) | Why bad | Good |
|---|---|---|
| "Promises can be tricky." | Generic, no action. | `- **[Mistake] Promise.all times out on ingestion.** Promise.all() on the ingestion pipeline times out after 30 items → use Promise.allSettled() in batches of 10 for this module. (2026-01-15, ingest/pipeline.ts)` |
| "Be careful with async." | Vague platitude. | `- **[Pattern] Checkout state lives in cartStore.** Local component state breaks because 3 components share the cart → always go through the Zustand store. (2026-01-15, cartStore.ts)` |
| "Fixed a bug on line 47." | Line number rots, not transferable. | `- **[Context] Mapper return type.** Mapper returns List<List<T>>, not List<T> → check the implementation before typing the result. (2026-01-15, UserMapper)` |
| "Tests are important." | Truism. | (do not record) |
| "Network was down, retried." | Temporary, one-off. | (do not record) |

## Examples for this repo

- `- **[Mistake] Zod contracts drift between copies.** server/src/vendor/shared and client/src/vendor/shared differ in several contracts → update both copies on any contract change. (2026-01-15, vendor/shared)`
- `- **[Mistake] docker compose down -v wipes the dev DB.** The devdigest_pgdata volume holds all imported repos and reviews → use docker compose down without -v. (2026-01-15, docker-compose.yml)`
- `- **[Context] Migrations do not run on boot.** Pulling schema changes leaves the DB stale → run pnpm db:migrate after pulling. (2026-01-15, server/src/db)`

## Dated comment on an existing entry

Add under the entry, never edit the entry itself:

```markdown
- **[Mistake] Zod contracts drift between copies.** ...
  - 2026-02-03 confirmed: changed trace.ts in server, client build broke until the client copy was updated.
```

## Nothing to record

If the task was a trivial edit, or every insight is already in INSIGHTS.md, write nothing and report: `No new insights for server.`
