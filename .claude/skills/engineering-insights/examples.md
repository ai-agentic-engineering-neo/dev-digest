# Engineering Insights — vague vs. useful

An entry earns its place only if it would change what a future session does.
"Interesting" isn't the bar — "actionable, from cold" is.

## Generic pattern (any repo)

**Vague — skip:**
> Promises can be tricky.

**Useful — write:**
> `Promise.all()` on the ingest pipeline times out past 30 items — use
> `Promise.allSettled()` batched by 10. (`src/ingest/pipeline.ts:88`)

---

**Vague — skip:**
> Be careful with async state.

**Useful — write:**
> Cart state always goes through `cartStore.ts` (Zustand) — 3 components
> share it; a local `useState` here will desync the checkout flow.
> (`src/features/cart/cartStore.ts:1`)

---

**Vague — skip:**
> The API has some limits.

**Useful — write:**
> Prisma Accelerate caps responses at 5MB — use `select`, not `include`, on
> any query that can return more than a few hundred rows.
> (`src/db/queries/orders.ts:41`)

## From this repo (dev-digest)

**Vague — skip:**
> The shared contracts package can get out of sync between client and server.

**Useful — write:**
> `@devdigest/shared` isn't a real package — it's hand-copied into
> `server/src/vendor/shared` and `client/src/vendor/shared`, and the copies
> have already drifted: `AgentManifest`, `sessionId`, and the `'openrouter'`
> provider id exist in the server copy but not the client copy.
> (`server/src/vendor/shared/contracts/eval-ci.ts:144-172` vs
> `client/src/vendor/shared/contracts/eval-ci.ts` — missing;
> `server/src/vendor/shared/adapters.ts:64-69` vs `client/src/vendor/shared/adapters.ts` — missing)
> → When you touch a shared contract, grep for it under `src/vendor/shared/`
> in **both** packages before assuming the change is complete.

**Duplicate — don't write, even though it's true and useful:**
> Migrations don't run on boot — run `pnpm db:migrate` manually.

This one is already documented in `server/README.md` under Troubleshooting
(and belongs in `server/CLAUDE.md`'s Gotchas as a standing rule) — writing it
again in `INSIGHTS.md` is noise, not signal. The anti-vague test isn't just
about vagueness; "already written elsewhere" fails it too.

## Entry shape

```markdown
## Codebase Patterns

- 2026-07-27 — `@devdigest/shared` is hand-copied into both packages' `src/vendor/shared`
  and already drifted (`AgentManifest`/`sessionId` missing from the client copy).
  Grep both copies before assuming a shared-contract change is complete.
  (`server/src/vendor/shared/contracts/eval-ci.ts:144`)
```

One finding, one line (wrap if needed), one citation, one date. Not a
paragraph, not a summary of the whole session.
