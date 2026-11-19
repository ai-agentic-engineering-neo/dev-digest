# engineering-insights — examples

Test for every entry: an agent reading it cold knows exactly what to do or avoid.
DevDigest entries below are FORMAT examples — verify before trusting them as facts.

## Bad → good

| ❌ Reject | Why | ✅ Actionable |
|---|---|---|
| Promises can be tricky | truism | `- 2026-03-24 — Promise.all() on ingest pipeline times out after ~30 items → use Promise.allSettled() in batches of 10 (evidence: src/ingest/run.ts#ingestAll)` |
| Be careful with async state | truism | `- 2026-03-24 — checkout state shared by 3 components; local state desyncs cart → keep it in Zustand (evidence: src/store/cartStore.ts#useCart)` |
| Tests are important | truism | `- 2026-11-19 — server *.it.test.ts fail without Docker → start Docker or run unit-only: pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| Bug at app.ts:142 fixed | line number goes stale, no rule | `- 2026-11-19 — hand-built error reply bypasses envelope → throw AppError subclass (evidence: server/src/platform/errors.ts#AppError)` |
| Maybe the indexer is slow because of git log? | unresolved hypothesis | Open Questions: `- 2026-11-19 — repo-intel index of big repo takes minutes; cause unconfirmed (git log vs embedding)` |
| Renamed variable, fixed types | trivial, won't recur | *(write nothing)* |
| Patched the logger in reviewer-core and broke server | incident, not lesson | `- 2026-11-19 — NEVER change reviewer-core exports without running server typecheck → server imports it as TS source via alias` |

## One per section

```markdown
## What Works
- 2026-11-19 — reviewer-core API change → run `npm run typecheck` there AND `pnpm typecheck` in server/ (server imports it as TS source via alias)

## What Doesn't Work
- 2026-11-19 — `pnpm install` in reviewer-core creates a stray pnpm-lock.yaml → package uses npm; run `npm ci` (evidence: reviewer-core/package-lock.json)

## Codebase Patterns
- 2026-11-19 — new endpoint → throw AppError subclass; hand-built reply bypasses error envelope (evidence: server/src/app.ts#buildApp)

## Tool & Library Notes
- 2026-11-19 — NEVER hand-edit migrations/meta/* snapshots → only `pnpm db:generate` keeps them consistent

## Recurring Errors & Fixes
- 2026-11-19 — "relation does not exist" right after boot → server does not migrate on boot; run `pnpm db:migrate` in server/

## Session Notes
### 2026-11-19
- Added X; first approach Y failed because W; settled on Z.

## Open Questions
- 2026-11-19 — run reaping assumes a single API instance; multi-instance plan unknown
```

## Correction (append-only)

```markdown
- 2026-12-02 — supersedes 2026-11-19 entry "pnpm install in reviewer-core": repo switched to pnpm → use `pnpm install` (evidence: reviewer-core/pnpm-lock.yaml)
```

## Cross-cutting → root `./INSIGHTS.md`
- 2026-11-19 — ALWAYS mirror a contract change in server/src/vendor/shared to client/src/vendor/shared in the same change → copies already drift
