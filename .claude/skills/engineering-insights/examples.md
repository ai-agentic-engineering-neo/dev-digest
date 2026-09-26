# Insight examples

Shape reference for the `engineering-insights` skill.

The per-package blocks below restate traps that are **already documented** in this
repo's `CLAUDE.md` files. They are here to show the shape of an entry, not to be
copied into any `INSIGHTS.md` — a real entry must add something those files do not
already say.

## Vague vs useful

**Bad**

> Promises can be tricky.

Nothing to act on. No file, no threshold, no rule. The next session re-investigates
from zero.

**Good**

> - **2026-09-19 — `Promise.all()` on the ingest pipeline times out past 30 items.**
>   The provider caps concurrent requests; the whole batch rejects on the first
>   timeout and the partial work is lost.
>   Rule: ALWAYS use `Promise.allSettled()` in batches of 10 on this path.
>   `server/src/modules/ingest/service.ts:88`

**Bad**

> Be careful with async.

**Good**

> - **2026-09-19 — Checkout state must go through the shared store.**
>   Three components read the cart; component-local state desynchronises them on
>   the second step of the flow.
>   Rule: ALWAYS route checkout state through `cartStore.ts`.
>   `client/src/lib/stores/cartStore.ts:14`

## Shape reference, one per package

`server/INSIGHTS.md` → **Recurring Errors & Fixes**

```markdown
- **2026-09-19 — `instanceof z.ZodError` misses errors across duplicate zod instances.**
  Two resolved copies of zod mean the prototype chain does not match, so a real
  validation error falls through to the generic 500 handler.
  Rule: NEVER narrow ZodError by `instanceof` alone — match by shape as `app.ts` does.
  `server/src/app.ts:64`
```

`client/INSIGHTS.md` → **What Doesn't Work**

```markdown
- **2026-09-19 — A body-less POST that declares JSON is rejected before the handler.**
  Fastify answers "Body cannot be empty when content-type is application/json",
  which reads like a server bug but originates in the caller.
  Rule: NEVER hand-set `content-type` — always go through `apiFetch`.
  `client/src/lib/api.ts:31`
```

`reviewer-core/INSIGHTS.md` → **Codebase Patterns**

```markdown
- **2026-09-19 — An unused prompt slot must not change the assembled prompt.**
  Slots are optional by contract; emitting an empty heading shifts the prompt for
  every review path at once, including the CI runner.
  Rule: ALWAYS omit a slot when empty and assert the unchanged prompt in a test.
  `reviewer-core/src/prompt.ts:120`
```

`e2e/INSIGHTS.md` → **Tool & Library Notes**

```markdown
- **2026-09-19 — Flows 02/04/05 follow the home redirect to the first repo.**
  Against a dev database with several imported repos they land on the wrong one
  and fail on a `wait --text` that looks unrelated.
  Rule: ALWAYS run these flows through `./scripts/e2e.sh`, never against the dev DB.
  `e2e/specs/02-repo-overview.flow.json:1`
```

## Not worth an entry

- A restatement of something `CLAUDE.md`, `README.md` or `TESTING.md` already says.
- "Tests should be written before the fix." General advice, not a repo fact.
- "Renamed `getUser` to `fetchUser`." A one-off change with no rule attached.

## Superseding an earlier entry

Never edit the old bullet. Append a new one that names the date it replaces:

```markdown
- **2026-09-19 — Supersedes the 2026-07-02 entry on retry counts.**
  The provider now returns 429 with `retry-after`; the fixed three-retry loop
  ignores it and burns the budget.
  Rule: ALWAYS honour `retry-after` when present, and fall back to three retries.
  `reviewer-core/src/llm/retry.ts:22`
```

## A review-mode merge

Two entries describing the same trap from different angles collapse into one,
keeping the earliest date and both pieces of evidence:

```markdown
- **2026-07-02 — Migrations are never applied on boot (merged 2026-09-19).**
  The API starts cleanly against an out-of-date schema and only fails on the first
  query that touches the new column.
  Rule: ALWAYS run `cd server && pnpm db:migrate` after pulling a branch that adds
  migrations.
  `server/src/db/migrate.ts:9`, `scripts/dev.sh:41`
```
