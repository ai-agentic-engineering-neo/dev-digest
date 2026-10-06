# Examples — what clears the bar

The test: would an agent reading this cold know exactly what to do, without re-investigating?

## Bad vs good
| ❌ Bad (noise) | ✅ Good (insight) |
|---|---|
| Promises can be tricky | `Promise.all()` on the ingest pipeline times out after 30 items → use `Promise.allSettled()` in batches of 10 |
| Careful with async | Checkout-flow state always goes through Zustand (`cartStore.ts`) — the cart is shared by 3 components; local state breaks it |
| Config can be weird | `LOG_LEVEL` can arrive as an empty string from `.env` → config schema must accept it (e993f25) |
| Watch response sizes | Prisma Accelerate has a 5 MB response limit → use `select`, not `include` (dev.to/evoleinik) |
| Remember to install deps | Server boot needs `reviewer-core/node_modules` installed — it compiles reviewer-core source via path alias (e993f25) |

## Kinds that usually qualify
- **User correction that generalizes** — "don't parse `req.body` in handlers here, validation is the Zod type provider's job".
- **Gotcha that cost time** — a cache, a silent fallback, an env var that fails quietly.
- **Same thing, two names** — "`run_id` in the API is `reviewId` in the client store; same value".
- **Data semantics** — "this table is append-only; the current row is the highest `version`, not the latest `created_at`".
- **Misleading signal** — "the endpoint returns 200 even when the job failed; check `<table>` for real state".
- **Env / dependency requirement** — something a fresh clone won't work without.
- **Decision with a reason** — a choice that looks arbitrary without its why.

## Reject — don't write
- A summary of what the change does (commit message / PR body).
- Anything the code makes obvious, or already in README, `docs/`, CLAUDE.md or INSIGHTS.md.
- Generic best practice not specific to this repo ("use strict mode").
- One-off typos and fixes that won't recur; notes about code that is still in flux.
- A narrative of the session ("first we tried…, then…") — extract the insight instead.
