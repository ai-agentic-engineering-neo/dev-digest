# Development Plan: Intent Layer reliability

- **Status:** in progress (approved 2026-11-07; decisions in "Open questions — resolved")
- **Goal:** When the intent model is slow or down, a burst of review runs on one PR makes **one** intent model call (not N sequential 30 s retries). A failure is remembered for 60 s per `(head_sha, input_hash)`, so later runs go ahead without intent at once. `PUT /pulls/:id/intent` gets its own rate limit. Every intent step writes one structured pino record (`cache`, `latencyMs`, `costUsd`, `reason`, …). Rate-limit responses get code `rate_limited` and a warn-level log (T4). `parseIntentSources` gets its own unit test (T5).
- **Specs:** [server/specs/intent-layer.md](../server/specs/intent-layer.md) (§4 lifecycle, §5 API, AC 6/7). T3 adds the reliability rules to it. Previous plan: [plans/intent-layer.md](intent-layer.md) (§2 call sequence and concurrency). Origin: `server/INSIGHTS.md` Open Questions, 2026-11-07 entry (`src/modules/intent/service.ts:152 → exclusive`).
- **Packages:** server only. **No client change** (see "Why no client change" below).
- **Out of scope:**
  - The intent eval set (course L06). New intent sources Q7 (sidebar-linked issues) and Q8 (full PR version of a modified doc).
  - A CHECK-constraint migration on `pr_intent` enum-like columns. Any new migration at all.
  - A `finishRun` / `ReviewRunExecutor` refactor. `run-executor.ts` changes only at its intent call site (T2).
  - Any edit to `server/src/vendor/shared/**` (pr-self-review blocks it, non-waivable) or `server/src/db/migrations/**`. No task needs one. If an implementer thinks one is needed, they stop and report it.
  - A new route-level max length for the override body: it already exists (see Open question 5).
  - A distributed (multi-process) single-flight or negative cache.

## Global constraints

- **Invariant: intent never filters, suppresses or downgrades a finding.** Nothing in this plan reads intent after `reviewPullRequest`. When intent is skipped (failure, negative cache, joined failure), the review runs as today without the intent block.
- **Single API instance per DB.** This is already assumed (server/CLAUDE.md Gotchas: "`RunBus` is an in-memory singleton; single API instance per DB is assumed", and `src/app.ts:78` NOTE). So the in-flight map and the negative cache are in-memory, per process, in the container singleton `container.intent` (`src/platform/container.ts:138-141`). They are lost on restart, which is acceptable: the worst case after a restart is one more model attempt.
- **Workspace scoping.** `getPullContext(workspaceId, prId)` (workspace-filtered on `pull_requests` and `repos`, `src/modules/intent/repository.ts:79-106`) runs **before** a caller joins an in-flight promise or reads the negative cache. A caller from another workspace never joins and never sees another PR's failure reason. Keys are the PR uuid. Entries are written only after that check.
- **Untrusted content never goes into logs.** Log records carry ids, enums, numbers and the error `reason` (already capped at 500 chars by `errMessage`, `service.ts:37`). They never carry intent text, scope items, source text, PR body or prompt.
- Onion: `single-flight.ts` is an application helper with **no imports**. `ports.ts` stays pure (no imports from `src/platform/`, the `domain-is-pure` rule in `.dependency-cruiser.cjs:40-55`). The service gets its logger per call (method parameter, the same pattern as `ReviewService.runReview(…, logger)` fed by `req.log` at `src/modules/reviews/routes.ts:41`). No container change. `app.ts` changes only in T4 (one 429 branch in the error handler). `cd server && node scripts/check-architecture.mjs` must report no new violations; the baseline may only shrink.
- Windows: run bins via node inside `server/` (`node node_modules/vitest/vitest.mjs …`, `node node_modules/typescript/bin/tsc …`), never `pnpm <script>`. Run `.it.test.ts` files **one at a time**: `dockerAvailable()` can time out when they run in parallel (server/INSIGHTS.md Open Questions, 2026-11-05).
- **RED first, in every task.** Write or extend the tests before the production change, run them against the unchanged code, and record in the task report which tests failed and why. A test that passes before the change does not count as RED.
- Implementers never edit `INSIGHTS.md`. The wrap-up (main session, `engineering-insights`) should add a CORRECTION of the 2026-11-07 Open Question (`exclusive()` queues `forReview`) once T2 lands.

## Design

### §1 What is wrong today (verified)

- `IntentService.exclusive()` (`server/src/modules/intent/service.ts:151-163`) loops `await existing` and then runs **its own** `fn`. `forReview` (`:104`) and `refresh` (`:67`) both use it.
- When the model fails, each queued `forReview` runs `compute` again. `compute` (`:165-205`) does not hit the positive cache because the row is not `ok` for this head/hash, so it calls the model again. Each call can take `INTENT_TIMEOUT_MS = 30_000` (`constants.ts:6`) with `INTENT_MAX_RETRIES = 1` (`constants.ts:7`). So N queued runs wait ≈ N × 30 s or more before their agents start.
- `exclusive()` is correct for **successes**: callers that wait get a cache hit. The fix must keep that behaviour and add sharing of failures.

### §2 Single-flight + negative cache — behaviour

Two in-memory structures in `IntentService`, both from the new helper `IN/single-flight.ts` (C1):

1. `flights: SingleFlight<Computed>`, keyed by `prId`. The promise covers **gather → fingerprint → positive cache check → negative cache check → model call → persist**.
2. `failures: NegativeCache`, keyed by `prId`, with one entry `{ headSha, inputHash, reason, expiresAt }`. TTL `INTENT_NEGATIVE_CACHE_TTL_MS = 60_000`.

`forReview(ws, prId, logger?)`, in order:
1. `getPullContext(ws, prId)`. If it is `undefined` → skipped `pull request not found` (unchanged).
2. `intentRepo.get(prId)`. If an override exists → ready, `cache: 'override'`. No flight, no negative cache. This check moves **out of** the flight; it is one PK read.
3. `flights.run(prId, () => compute(ws, ctx, { force: false }))`.
   - If a flight is running for this PR, the caller **joins** it (`joined: true`) and gets the same outcome. It does no gather and no model call of its own.
   - Otherwise it starts one and registers it **synchronously**, before the first `await`, so callers in the same tick join it.
4. Inside `compute` with `force: false`:
   - gather + `inputHash`, as today;
   - positive cache hit → `{ kind: 'record', cache: 'hit' }` (unchanged);
   - else `failures.get(prId, { headSha, inputHash })` is active → `{ kind: 'recent_failure', reason, retryInMs }`. **No model call, no `saveFailure` write**;
   - else derive. On success → `failures.delete(prId)` and return `{ kind: 'record', cache: 'miss' }`. On failure → `failures.set(prId, { headSha, inputHash, reason })` **first**, then the best-effort `saveFailure` (unchanged), then rethrow.
5. Mapping to `ReviewIntentResult` (type unchanged, `domain/types.ts:131-133`):
   - a joined success → `step.cache = 'hit'` with 0 tokens. The run's Live Log shows the existing `… (computed earlier)` text (`render.ts:202-203`), so a joiner never shows tokens or cost it did not pay for. No domain or render change.
   - `recent_failure` → skipped with reason `recent failure (retry in <ceil(retryInMs/1000)>s): <original reason>`.
   - A thrown error (leader or joiner) → skipped with `errMessage(e)`, as today.

`refresh(ws, prId, logger?)`: `flights.runAfter(prId, () => compute(ws, ctx, { force: true }))`.
- It waits for any in-flight work (ignoring its outcome), then registers its own forced derivation, so reviews that arrive meanwhile join it. This is today's `exclusive` semantics, kept for refresh only.
- With `force: true` it **bypasses both caches**. On success it clears the negative entry. On failure it re-arms the entry, so queued reviews don't retry, then throws `ExternalServiceError` (502, unchanged).

**Decision matrix** (each line is a test in T2):

| Situation | Behaviour | Why |
|---|---|---|
| 3 concurrent `forReview`, model fails | 1 model call, 1 `saveFailure`, all 3 skipped | the goal |
| `forReview` 5 s after a failure, same head and hash | skipped at once, 0 model calls, no DB write | negative cache |
| same, but 60 001 ms later | model called again | TTL |
| same, but a new `head_sha`, edited body or other model in Settings | model called (the hash or head differs) | key is `(head_sha, input_hash)`; `input_hash` already covers body, issues, docs, provider, model and prompt version (`canonicalIntentInput`) |
| `POST …/refresh` during the TTL | model called (bypass). Success clears the entry, failure re-arms it and returns 502 | an explicit user action, e.g. after fixing the API key, must not be blocked for 60 s |
| `forReview` while a refresh is in flight | joins the refresh's derivation | one model call |
| `PUT` override during the TTL | next `forReview` is ready with `cache: 'override'`, 0 model calls. The negative entry is untouched | the override check runs before the flight. The override never touches derived columns (`saveDerived` never names `override_*`, `repository.ts:162`) |
| `DELETE` override during the TTL | the entry stays until it expires | model health did not change. A refresh still bypasses it |
| failure while an older `ok` row exists | the row stays `ok` (`setWhere`, `repository.ts:196`), the negative entry is still set | see the next paragraph |

**Why the negative cache is in memory and not the persisted failure row.** `saveFailure` uses `onConflictDoUpdate({ setWhere: ne(status, 'ok') })`. When an `ok` row exists, for example an older head, the update is blocked, `returning()` gives zero rows, and the repository falls back to `get()` (`repository.ts:190-203`; server/INSIGHTS.md 2026-11-06 Drizzle `setWhere` entry). So the DB does **not** record the failure in exactly the "model went down after an earlier success" case, and a DB-based negative cache would miss it. The in-memory entry is set **before** the best-effort `saveFailure` and never depends on its return value or its success. The persisted row keeps its current meaning: UI status/error. It is now written **once per real model failure** (leader only), never by joiners or negative-cache hits.

Memory bound: `SingleFlight` deletes an entry when its promise settles. `NegativeCache` holds at most one entry per PR, deletes expired entries on read, and sweeps expired entries on every `set`.

### §3 Structured intent log record

- **Today:** `IntentService` has **no logger**. The container has none either (`container.ts` has no logger field). The only intent pino output is the executor's `logger?.warn({ prId, reason }, 'review: intent skipped')` (`run-executor.ts:126`), plus the `RunLogger` stdout mirror of the Live Log text, which puts the data in the message string.
- The executor's `logger` is the review request's `req.log` (`reviews/routes.ts:41` → `ReviewService.runReview(…, logger)` `service.ts:103-107` → `executeRuns(…, logger)` `run-executor.ts:61`).
- Other code logs with an object first, e.g. `logger?.info({ runId, agent, findings, grounding, durationMs }, '…')` (`run-executor.ts:138-147`) and `app.log.warn({ err }, '…')` (`pulls/routes.ts:46`).
- **New:** the service emits **exactly one** record per `forReview` call and per `refresh` call that found the PR, through an optional per-call `IntentLogger` (C2).
  - `info` when ready, `warn` when skipped or failed.
  - Message `intent: ready` / `intent: skipped` / `intent: failed`.
  - The executor passes its `logger` and **drops** its own `review: intent skipped` warn, so there is no duplicate record. The Live Log lines (`runLog.tool/result/info`) are unchanged. The refresh route passes `req.log` (T3).

| Path | `trigger` | `outcome` | `cache` | `costUsd` | `tokensIn/Out` | `provider/model` |
|---|---|---|---|---|---|---|
| override used | review | ready | `override` | null | 0/0 | null |
| positive cache hit | review | ready | `hit` | null | 0/0 | record usage |
| joined a successful flight | review | ready | `joined` | null | 0/0 | record usage |
| derived now | review | ready | `miss` | usage cost | usage | usage |
| derived now, but no block text | review | skipped | `miss`/`hit`/`joined` | as above | as above | as above |
| model failed (leader) | review | skipped | `miss` | null | 0/0 | null |
| joined a failed flight | review | skipped | `joined` | null | 0/0 | null |
| negative cache hit | review | skipped | `negative` | null | 0/0 | null |
| PR not found / gather or DB error | review | skipped | null | null | 0/0 | null |
| refresh ok | refresh | ready | `miss` | usage cost | usage | usage |
| refresh failed | refresh | failed | `miss` | null | 0/0 | null |

- Field names are **camelCase** (`prId`, `latencyMs`, `costUsd`, `tokensIn`, `tokensOut`) to match the executor's existing pino fields (`run-executor.ts:138-147`), plus `event: 'intent'` for filtering (decision OQ6).
- `latencyMs` is the clock time from method entry to return or throw. It includes time spent waiting on a joined flight.
- `costUsd` appears only on the record that paid for a model call. Summing `costUsd` over records therefore never double-counts. Intent cost is still **not** added to any run's spend (unchanged).
- `reason` is `null` when ready, else the skip/failure reason.

### Why no client change

A 429 from `PUT /pulls/:id/intent` reaches the client as `ApiError(message = "Rate limit exceeded, retry in 1 minute", status 429)` (`client/src/lib/api.ts:44-58`; message from `@fastify/rate-limit` `defaultErrorResponse`, `index.js:31-35`). The global `MutationCache` toast shows it (`client/src/lib/query-client.ts:26`), and `IntentCard.handleSave` catches the rejection and keeps the edit form open (`IntentCard.tsx:73-80`). So the user sees the reason and keeps their text. A dedicated 429 UI is not needed (Open question 8 covers the envelope `code`).

## Contracts (Wave 0 — owned by T1, consumed by T2/T3)

Shorthand: `IN/` = `server/src/modules/intent/`.

### C1 — `IN/single-flight.ts` (new, application helper, no imports) — T1
```ts
/** Concurrent callers for one key share ONE promise. In-memory, per process. */
export class SingleFlight<T> {
  /** Joins the promise in flight for `key`, or starts `fn()` and registers it SYNCHRONOUSLY
   *  (before any await) until it settles. Cleanup uses `promise.then(clear, clear)` and only
   *  deletes the entry if it is still the same promise, so no unhandled rejection is created. */
  run(key: string, fn: () => Promise<T>): { promise: Promise<T>; joined: boolean };
  /** Waits (ignoring outcomes) until nothing is in flight for `key`, re-checking after each wait,
   *  then starts `fn()` and registers it so later run() callers join it. Never joins. */
  runAfter(key: string, fn: () => Promise<T>): Promise<T>;
  /** Keys currently in flight (diagnostics/tests). */
  get size(): number;
}

export interface NegativeHit { reason: string; retryInMs: number }
/** Remembers one recent failure per key, matched on (headSha, inputHash). */
export class NegativeCache {
  constructor(ttlMs: number, now?: () => number);   // now defaults to Date.now
  /** Active entry iff headSha AND inputHash match and now < expiresAt. Expired entries are deleted on read. */
  get(key: string, match: { headSha: string; inputHash: string }): NegativeHit | undefined;
  /** Records (overwrites) the key's failure with expiresAt = now + ttlMs; sweeps expired entries first. */
  set(key: string, entry: { headSha: string; inputHash: string; reason: string }): void;
  delete(key: string): void;
  get size(): number;
}
```

### C2 — `IN/ports.ts` additions (pure types, no new imports) — T1
```ts
export type IntentLogCache = 'hit' | 'miss' | 'override' | 'joined' | 'negative';
/** One structured pino record per forReview / refresh call (camelCase fields like the executor's, see Design §3). */
export interface IntentLogRecord {
  event: 'intent';
  trigger: 'review' | 'refresh';
  prId: string;
  outcome: 'ready' | 'skipped' | 'failed';
  cache: IntentLogCache | null;
  latencyMs: number;
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  provider: string | null;
  model: string | null;
  reason: string | null;
}
/** Pino-compatible sink (object first). Fastify `req.log` and the executor's `Logger` both satisfy it. */
export interface IntentLogger {
  info: (fields: IntentLogRecord, msg: string) => void;
  warn: (fields: IntentLogRecord, msg: string) => void;
}
```

### C3 — `IN/constants.ts` additions — T1
```ts
/** How long a failed derivation is remembered per (head_sha, input_hash). Decision OQ1. */
export const INTENT_NEGATIVE_CACHE_TTL_MS = 60_000;
/** PUT /pulls/:id/intent (cheap DB write, no model call). Decision OQ4. */
export const OVERRIDE_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
```

### C4 — `IntentService` signatures after T2 (`IN/service.ts`)
```ts
constructor(deps: IntentDeps, clock: () => number = Date.now)   // container keeps `new IntentService(this)`
forReview(workspaceId: string, prId: string, logger?: IntentLogger): Promise<ReviewIntentResult>; // NEVER throws
refresh(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntent>;            // 404 not_found · 502 external_service_error
// get / setOverride / resetOverride: unchanged signatures and behaviour.
```

### C5 — route config after T3 (`IN/routes.ts`)
```
PUT /pulls/:id/intent  config: { rateLimit: OVERRIDE_RATE_LIMIT }  → 200 PrIntent · 404 not_found · 422 validation_error · 429 (rate limit, test-env exempt)
POST /pulls/:id/intent/refresh  unchanged REFRESH_RATE_LIMIT (10/min); handler passes req.log to service.refresh
```

## File ownership map

| File | Task | New / Modified |
|---|---|---|
| `server/src/modules/intent/single-flight.ts` | T1 | N |
| `server/src/modules/intent/ports.ts` | T1 | M |
| `server/src/modules/intent/constants.ts` | T1 | M |
| `server/test/intent-single-flight.test.ts` | T1 | N |
| `server/src/modules/intent/service.ts` | T2 | M |
| `server/src/modules/reviews/run-executor.ts` | T2 | M (intent call site only, lines 111-128) |
| `server/test/intent-service.test.ts` | T2 | M |
| `server/test/intent-review.it.test.ts` | T2 | M |
| `server/src/modules/intent/routes.ts` | T3 | M |
| `server/test/intent-rate-limit.it.test.ts` | T3 | N |
| `server/specs/intent-layer.md` | T3 | M |
| `server/src/app.ts` | T4 | M (error handler only: one 429 branch before the generic fallback) |
| `server/test/app-rate-limit.test.ts` | T4 | N |
| `server/test/intent-schemas.test.ts` | T5 | M |

Hotspot: `app.ts` (T4 only, error handler only). No change to `modules/index.ts`, `platform/container.ts`, `db/schema/*`, `client/**`.

## Tasks

### T1 [W1] [backend] Single-flight + negative-cache helpers, log port, constants
- **Status:** done
- **Files (only these):** `server/src/modules/intent/single-flight.ts`, `server/src/modules/intent/ports.ts`, `server/src/modules/intent/constants.ts`, `server/test/intent-single-flight.test.ts`
- **Depends on:** —
- **Produces:** C1, C2, C3 exactly.
- **Insights:**
  - `2026-11-07 — exclusive() queues forReview calls per PR; when the model is down each queued run retries in turn (~N×30s, INTENT_TIMEOUT_MS) → replace with a shared in-flight promise + short negative cache (src/modules/intent/service.ts:152 → exclusive).` (server/INSIGHTS.md, Open Questions)
  - `2026-11-05 — Correction: layer rules moved to .dependency-cruiser.cjs and the check is now node scripts/check-architecture.mjs …; legacy violations frozen in architecture-baseline.json, which may only shrink …` → `ports.ts` must stay import-free from `src/platform/`; `single-flight.ts` imports nothing.
- **Skill focus:** onion-architecture rules 5 and 9 (pure port types; the clock is injected, not read globally inside the cache logic); typescript-expert (generic `SingleFlight<T>` only where needed, no `any`, `readonly` maps).
- **Steps:**
  1. **RED first.** Write `test/intent-single-flight.test.ts` (below) before `single-flight.ts` exists. Run it and record the failure (the module can't be resolved).
  2. Implement C1:
     - `run` registers the promise **before** returning, with no `await` between the `has` check and `set`.
     - Cleanup is `promise.then(clear, clear)` with an identity check.
     - `runAfter` loops `while (map.has(key)) await map.get(key)!.catch(() => undefined)`, then registers. This is the current `exclusive` logic at `service.ts:152-163`, moved here.
     - `NegativeCache` uses the injected `now`.
  3. Add C2 to `ports.ts` (types only) and C3 to `constants.ts`. Keep existing exports unchanged.
  4. Tests (`describe('SingleFlight')`, `describe('NegativeCache')`, fake clock `let t = 0; const now = () => t;`, deferred promises built from `new Promise` with captured resolve/reject):
     - 3 `run` calls with the same key before the first settles → `fn` called once, `joined` = `[false, true, true]`, all 3 promises resolve to the same value; `size` is 0 after settle;
     - a rejection is delivered to the leader and both joiners (`rejects.toThrow`); no unhandled rejection (vitest fails the run on one); `size` is 0 after settle;
     - a `run` after the previous one settled starts a new `fn` (`joined: false`);
     - different keys never share;
     - `runAfter` while a flight is pending: its `fn` starts only after the pending one settles (also when that one rejects); a `run` call made while `runAfter`'s fn is pending joins it;
     - `NegativeCache`: `set` then `get` with the same head/hash → hit with `retryInMs = ttl - elapsed`; different `headSha` → miss; different `inputHash` → miss; at `t = ttl` → miss and the entry is deleted (`size` 0); `delete` removes; `set` sweeps other expired keys (`size` drops).
  5. **Mutation check** (proves the sharing test is not vacuous). Temporarily make `run` behave like today's `exclusive` (await the existing promise, then call `fn` anyway). The "fn called once" test must fail. Revert and record the result in the report.
- **Acceptance criteria:**
  - [ ] All C1–C3 symbols exist exactly as written. `single-flight.ts` has no `import` lines. `ports.ts` has no new import.
  - [ ] RED evidence (step 1) and mutation evidence (step 5) are in the task report.
  - [ ] `IntentService` is untouched (it still uses its private `exclusive`; T2 switches it).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-single-flight.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T2 [W2] [backend] IntentService: true single-flight, negative cache, structured log record; executor passes its logger
- **Status:** done
- **Files (only these):** `server/src/modules/intent/service.ts`, `server/src/modules/reviews/run-executor.ts`, `server/test/intent-service.test.ts`, `server/test/intent-review.it.test.ts`
- **Depends on:** T1
- **Produces:** C4. Behaviour exactly as Design §2 (decision matrix) and §3 (record table).
- **Insights:**
  - `2026-11-06 — Drizzle onConflictDoUpdate({ setWhere }) + .returning() returns ZERO rows when setWhere blocks the update (it does not return the existing row) → after a guarded upsert, get() the row when returning is empty (src/modules/intent/repository.ts:172 → saveFailure).` → The repository already handles this (`repository.ts:199-203`). Don't change it. The negative entry must be set **before** and **independently of** `saveFailure`, whose errors stay swallowed (`service.ts:191-202`).
  - `2026-11-07 — exclusive() queues forReview calls per PR … (src/modules/intent/service.ts:152 → exclusive).` → Delete the private `exclusive` and the `inFlight` map. Their replacements are `SingleFlight.run` (reviews) and `runAfter` (refresh).
  - `2026-11-06 — Flaky .it test …: waitForPrRuns and the UI treat agent_runs.status = 'done' as "all persisted" … (src/modules/reviews/run-executor.ts:316 → executeOne; test/helpers/runs.ts:14 → waitForPrRuns).` → In the new `.it` case, assert on the fake logger only after `waitForPrRuns`. The intent record is written before the agent loop, so it is complete by then. Don't touch `executeOne`.
  - `2026-11-04 — ReviewService builds new ReviewRepository(container.db) instead of container.reviewRepo …` → irrelevant to the change. Don't "fix" it here (finishRun/executor refactors are out of scope).
- **Skill focus:** security (workspace check before join/negative read; no untrusted text in log fields); typescript-expert (private discriminated union `Computed = { kind: 'record'; record: IntentRecord; cache: 'hit' | 'miss' } | { kind: 'recent_failure'; reason: string; retryInMs: number }`, exhaustive handling); onion-architecture rule 9 (clock injected via constructor, logger via parameter; the container is unchanged).
- **Steps:**
  1. **RED first: tests in `test/intent-service.test.ts`** (extend `setup()` with a fake clock `let t = 1_000; const clock = () => t;` passed as `new IntentService(deps, clock)`, and a `fakeLogger()` returning `{ info: vi.fn(), warn: vi.fn() }`). Add:
     - (a) **shared failure**: LLM `completeStructured` returns a deferred promise and counts calls. Start 3 concurrent `forReview`, then reject. Expect 1 model call, 1 `saveFailure` (spy on `FakeIntentRepo.saveFailure`), and all 3 `status: 'skipped'`.
     - (b) **negative hit**: after (a), `t += 5_000`, then `forReview`. Expect 0 new model calls and 0 new `saveFailure`. The reason matches `/^recent failure \(retry in 55s\): /`.
     - (c) **TTL**: `t += 60_001` after the failure → the model is called again.
     - (d) **key**: within the TTL, a new `headSha` (and separately a body edit) → the model is called.
     - (e) **refresh bypass**: within the TTL, `refresh` with a working LLM → 1 model call, 200 DTO; the next `forReview` → ready `cache: 'hit'`, 0 calls. Also: a failing `refresh` → `ExternalServiceError`, and a following `forReview` is a negative hit.
     - (f) **override during the TTL**: `setOverride` → `forReview` ready `cache: 'override'`, 0 calls.
     - (g) **joined success**: 3 concurrent successful `forReview` → 1 call; exactly one result has `step.cache === 'miss'`, the other two have `'hit'` with `tokensIn === 0`.
     - (h) **log record**: the LLM stub advances `t += 250` before resolving.
       - Leader: `info` called once with `expect.objectContaining({ event: 'intent', trigger: 'review', prId: PR, outcome: 'ready', cache: 'miss', latencyMs: 250, costUsd: 0.001, tokensIn: 100, reason: null })` and `'intent: ready'`.
       - Joiner: `cache: 'joined', costUsd: null`.
       - Negative hit: `warn` with `cache: 'negative'`, `outcome: 'skipped'`.
       - `refresh` failure: `warn` with `trigger: 'refresh'`, `outcome: 'failed'`.
       - Exactly one record per call.
       - No record field contains the fixture intent text `'Fix the login timeout.'` (`JSON.stringify` check).
     - Run against the **unchanged** `service.ts` and record the result. (a), (b) and (g) fail on call counts (3 calls / 1 extra call / two `'miss'`), (h) fails because no record is emitted (the logger argument is ignored), and the suite type-checks only after C4. Note which ones fail at runtime vs compile time. Keep every existing test unchanged; all must stay green.
  2. **RED first: executor `.it` case in `test/intent-review.it.test.ts`**: `it('the review batch emits one structured intent record through the request logger')`.
     - Build the app as in `appWith(newMock())`.
     - Create the PR and agent with the existing helpers.
     - Call `new ReviewService(app.container)` (`src/modules/reviews/service.ts`) `.resolveTargets(workspaceId, { agentId })`, then `.runReview(workspaceId, pr.id, targets, logger)` with `logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }`.
     - `await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 })`.
     - Assert exactly one `info` call whose first argument matches `objectContaining({ event: 'intent', trigger: 'review', prId: pr.id, cache: 'miss', costUsd: 0.001 })`.
     - Against the unchanged executor this fails: the logger never reaches the service.
  3. Implement in `service.ts`:
     - fields `private readonly flights = new SingleFlight<Computed>()` and `private readonly failures = new NegativeCache(INTENT_NEGATIVE_CACHE_TTL_MS, clock)`;
     - `compute(ws, ctx, { force })` returns `Computed` and follows Design §2 step 4 (the force path skips both cache checks);
     - `forReview` / `refresh` follow §2;
     - one private `emit(logger, record)` builds the §3 record (`info` when outcome is `ready`, else `warn`) and is called exactly once per path, including the outer `catch` of `forReview`;
     - `latencyMs = clock() - t0`.
     - Delete `exclusive` and `inFlight`. Update the class doc comment.
  4. `run-executor.ts`:
     - `this.container.intent.forReview(workspaceId, pull.id, logger)` (line 112);
     - delete the `logger?.warn({ prId: pull.id, reason: intentResult.reason }, 'review: intent skipped')` line (126), because the service now writes that record with more fields;
     - leave the `.catch` fallback and the `runLog` lines unchanged.
     - The executor's `Logger` type (`run-executor.ts:22-27`) is structurally assignable to `IntentLogger`. Don't change it.
- **Acceptance criteria:**
  - [ ] Every decision-matrix row in Design §2 is covered by a passing test in `intent-service.test.ts`. All tests that existed before pass unchanged (AC 6, AC 7, AC 11 of the spec included).
  - [ ] `Grep "exclusive|inFlight" server/src/modules/intent` → 0 matches. `Grep "intent skipped" server/src` → 0 matches.
  - [ ] RED evidence for step 1 and step 2 is in the task report.
  - [ ] `saveFailure` is called once per real model failure. Joiners and negative-cache hits never write.
  - [ ] Findings are never filtered: the existing `intent-review.it.test.ts` AC 6/8/9/10 and AC 7 cases still pass.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-service.test.ts test/intent-single-flight.test.ts` → all pass
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-review.it.test.ts` → all pass (Docker; a "skipping" warning = not verified, report it)
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T3 [W3] [backend] Rate limit on PUT override, refresh logs via req.log, spec update
- **Status:** done
- **Files (only these):** `server/src/modules/intent/routes.ts`, `server/test/intent-rate-limit.it.test.ts`, `server/specs/intent-layer.md`
- **Depends on:** T1 (`OVERRIDE_RATE_LIMIT`), T2 (`refresh(…, logger)`)
- **Produces:** C5.
- **Insights:**
  - `2026-11-05 — Skill content rules … live in the SERVICE …; route Zod only checks shape — a pr-self-review zod finding "manual POST/PUT bypasses the 50k limit" was a false positive → before adding a route-level .max(), check assertBody/assertName; extend them, don't duplicate (src/modules/skills/service.ts:45 → assertBody …).` → For intent, the route Zod **already** has `.max(INTENT_MAX_CHARS)` (`schemas.ts:75`), and the service clamps again (`service.ts:75`, `cleanItems` `:41-46`). Don't add another max (OQ5).
  - `2026-11-05 — Integration tests intermittently skip (Docker not available) or fail when the full suite runs in parallel … consider … running .it.test.ts files sequentially.` → Run the new file alone.
- **Skill focus:** fastify-best-practices (per-route `config.rateLimit` object, the same mechanism as `REFRESH_RATE_LIMIT` at `routes.ts:34`, `reviews/routes.ts:29` and `settings/routes.ts:72`; no ad-hoc `reply.status`); security A06 (rate limiting a write endpoint).
- **Steps:**
  1. **RED first.** Write `test/intent-rate-limit.it.test.ts`:
     - Same harness as `intent-routes.it.test.ts`: `startPg`, `seed`, mock secrets/github/git/llm overrides, a repo + PR.
     - But `config: loadConfig({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv)`. `@fastify/rate-limit` is registered only when `nodeEnv !== 'test'` (`src/app.ts:95-97`). `silent` turns the logger off (`app.ts:50-52`).
     - Cases:
       - (a) 20 × `PUT /pulls/:id/intent` with a valid body → all 200; the 21st → **429** with a `retry-after` header. **RED:** against the unchanged route the 21st returns 200, because only the global 120/min applies.
       - (b) **Regression, not RED** (`REFRESH_RATE_LIMIT` already exists): 10 × `POST …/refresh` → 200, the 11th → 429.
       - (c) After (a), a `GET /pulls/:id/intent` still returns 200. Per-route stores are separate (`@fastify/rate-limit` `index.js:142-149` creates a child store per route config).
     - Assert only the status and the header, not the envelope `code` (OQ8).
     - Use a fresh `buildApp` per case so the in-memory stores don't leak between cases, and `await app.close()`.
  2. Run it against the unchanged `routes.ts`. Record that (a) fails (21st = 200) and that (b) and (c) pass.
  3. `routes.ts`:
     - PUT gets `config: { rateLimit: OVERRIDE_RATE_LIMIT }`;
     - the refresh handler calls `service.refresh(workspaceId, req.params.id, req.log)`;
     - update the doc comment at the top (PUT is rate-limited).
     - Don't add a logger to GET/PUT/DELETE: they make no model call, so there is no intent record to write.
  4. `server/specs/intent-layer.md`:
     - §4 Lifecycle: add two bullets. One for single-flight: concurrent review batches share one derivation, a failure is shared, and refresh waits and then forces. One for the negative cache: 60 s per `(head_sha, input_hash)`, refresh bypasses it, in-memory and single-instance.
     - §5 API: rate limits are refresh 10/min and PUT 20/min per client IP, and both return 429.
     - Acceptance criteria: append AC 14 ("3 concurrent review batches with a failing model make 1 model call; a 4th within 60 s makes none") and AC 15 ("each intent step writes one structured log record with `cache`, `latencyMs`, `costUsd`, `reason`").
- **Acceptance criteria:**
  - [ ] (a) is RED before the change and green after; (b) and (c) are green.
  - [ ] `PUT` still returns 422 for an invalid body and 404 for another workspace's PR (existing `intent-routes.it.test.ts` unchanged and green).
  - [ ] `routes.ts` stays thin: no `reply.status`, no business `if`.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-rate-limit.it.test.ts` → all pass (Docker, alone)
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-routes.it.test.ts` → all pass (Docker, alone)
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T4 [W1] [backend] Rate-limit responses: code `rate_limited`, warn-level log
- **Status:** done
- **Files (only these):** `server/src/app.ts`, `server/test/app-rate-limit.test.ts`
- **Depends on:** —
- **Produces:** a 429 from `@fastify/rate-limit` returns `{ error: { code: 'rate_limited', message } }` with status 429 (the plugin's `retry-after` header kept) and is logged with `app.log.warn`, not `app.log.error`. Every other error path is unchanged.
- **Insights:**
  - `2026-11-07 — A 429 from @fastify/rate-limit is not an AppError, so the error handler's fallback answers it with code internal_error and logs it via app.log.error … → map statusCode === 429 to a rate_limited code at warn level before the fallback (src/app.ts:159 → setErrorHandler fallback; plans/intent-reliability.md Q8).` (server/INSIGHTS.md, Open Questions)
  - `2026-11-07 — Under NODE_ENV=test @fastify/rate-limit is not registered AT ALL … → a 429 test must build the app with nodeEnv: 'production' (src/app.ts:95 → rateLimit registration).` (server/INSIGHTS.md, Codebase Patterns)
- **Skill focus:** fastify-best-practices (error handler; keep one envelope shape `ApiErrorBody`); security (don't leak internals in the 429 message: reuse the plugin's message).
- **Steps:**
  1. **RED first.** Write `test/app-rate-limit.test.ts` (no DB, like `test/routes-smoke.test.ts`: postgres-js connects lazily):
     - `config = loadConfig({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv)`. `silent` sets `logger: false` (`app.ts:50-52`), so `app.log` methods are no-ops that `vi.spyOn` can replace.
     - `const app = await buildApp({ config })`. `buildApp` does not call `ready()` (`app.ts:175`), so the test registers its own route: `app.get('/__rl-probe', { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } }, async () => ({ ok: true }))`.
     - `const warn = vi.spyOn(app.log, 'warn'); const error = vi.spyOn(app.log, 'error');`
     - (a) 1st inject → 200. 2nd → 429, `res.json().error.code === 'rate_limited'`, `res.headers['retry-after']` defined, `warn` called once, `error` not called.
     - (b) Regression: a probe route that throws `new Error('boom')` → 500, code `internal_error`, `error` called (the generic fallback is unchanged).
     - `await app.close()` per case.
  2. Run it against the unchanged `app.ts`. Record that (a) fails (code `internal_error`, `error` called) and (b) passes. If `loadConfig` with `NODE_ENV: 'production'` throws for a missing env var, set that var in the test's env object and say so in the report.
  3. `app.ts` error handler: just before `app.log.error(err)` (the generic fallback), add a branch for `(err as { statusCode?: number }).statusCode === 429` → `app.log.warn({ statusCode: 429, url: req.url }, 'rate limited')` and `reply.status(429).send({ error: { code: 'rate_limited', message: e.message ?? 'Rate limit exceeded' } })`. The handler's request parameter is `_req` today; rename it to `req` for this branch. Change nothing else.
- **Acceptance criteria:**
  - [ ] (a) RED before, green after; (b) green before and after.
  - [ ] Existing route tests still pass: `test/routes-smoke.test.ts` and the 422/404/502 cases in `intent-routes.it.test.ts`.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/app-rate-limit.test.ts test/routes-smoke.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T5 [W1] [backend] Unit test for `parseIntentSources`
- **Status:** done
- **Files (only these):** `server/test/intent-schemas.test.ts`
- **Depends on:** —
- **Produces:** tests only. No production change.
- **Insights:**
  - `2026-11-07 — z.array(X).safeParse(row.sources) on a jsonb list fails as a whole, so ONE invalid entry … silently emptied every intent source → read stored jsonb lists entry by entry and drop only the bad one (src/modules/intent/schemas.ts:35 → parseIntentSources).` (server/INSIGHTS.md, What Doesn't Work)
- **Skill focus:** zod (safeParse per entry); typescript-expert (typed fixtures from `IntentSource`).
- **Steps:**
  1. Add `parseIntentSources` to the import at `test/intent-schemas.test.ts:2`. Add a `describe('parseIntentSources')` with:
     - one bad entry among valid ones (e.g. `{ ...source, issue_number: 0 }` between two valid sources) → returns exactly the two valid ones, in order;
     - all entries valid → returned unchanged;
     - `null` → `[]`; `{}` → `[]`; `undefined` → `[]`.
     Reuse the file's existing `source` fixture.
  2. **RED check (mutation, because the code already exists).** Temporarily replace the body of `parseIntentSources` (`src/modules/intent/schemas.ts:35`) with the old whole-list parse: `const r = IntentSourceList.safeParse(raw); return r.success ? r.data : [];`. The "one bad entry" test must fail (it returns `[]`). Revert, re-run green, and record both results in the report. Leave `schemas.ts` byte-identical (`git diff --quiet server/src/modules/intent/schemas.ts`).
- **Acceptance criteria:**
  - [ ] Mutation evidence in the report; `schemas.ts` unchanged.
  - [ ] All existing tests in the file pass unchanged.
- **Verify:**
  - `cd server && node node_modules/vitest/vitest.mjs run test/intent-schemas.test.ts` → all pass
  - `cd "$(git rev-parse --show-toplevel)" && git diff --quiet server/src/modules/intent/schemas.ts` → exit 0

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W1 | T1, T4, T5 | in parallel (disjoint files) | each task's Verify; typecheck; layer check |
| W2 | T2 | alone | T2 Verify incl. `intent-review.it.test.ts` (alone) + full server unit suite |
| W3 | T3 | alone | T3 Verify (both `.it` files run one at a time); layer check |

W2 and W3 are sequential on purpose. `service.ts` (T2) and `routes.ts` (T3) each have one owner, and T3 needs T2's `refresh` signature. T4 and T5 share no file with T1, T2 or T3, so they run in W1.

## Risks · Review focus

- **Single-flight correctness** (T1, T2): the promise is registered synchronously, so callers in the same tick join. Cleanup must not delete a newer flight (identity check). There must be no unhandled rejection when every caller already got the error. `refresh` must never join a non-forced flight: a refresh that joined a cache-hit flight would return a cached record and break "refresh bypasses the cache".
- **Negative cache scope** (T2): keyed by `prId`, matched on `headSha` + `inputHash`, read only after the workspace-checked `getPullContext`. Refresh bypasses it and clears it on success. An override is checked before it. It is set before `saveFailure`, independent of the Drizzle `setWhere` zero-rows behaviour. Joiners and hits never write `pr_intent`.
- **Log double-counting / leakage** (T2): `costUsd` only on the paying record; joiners show `cache: 'hit'` in the Live Log and `joined` in pino. No intent, scope or source text in any field. Exactly one record per call: the executor's old warn is removed.
- **Rate-limit test realism** (T3): the plugin is off when `NODE_ENV=test` (`app.ts:95`). The test must build the app with a non-test `nodeEnv`, or the 429 is never reachable, which would be a false RED or GREEN.
- **Regression of the original AC 6/7/11** (T2): the existing tests stay unmodified and green. In particular, sequential runs still show `Intent ready (cache hit)` in the second run's Live Log (`intent-review.it.test.ts:192`).

## Citations verified

Every path, line and status code above was opened with Read or matched with Grep/Glob on branch `feat/intent-reliability` (= `origin/main` at `c0e91f4`).

| Citation | How confirmed |
|---|---|
| `server/src/modules/intent/service.ts:151-163` `exclusive`, `:55` `inFlight`, `:67` refresh uses it, `:104` forReview uses it, `:165-205` `compute`, `:191-202` swallowed `saveFailure`, `:37` `errMessage` `.slice(0, 500)`, `:41-46` `cleanItems`, `:75` intent clamp, `:76` `ValidationError` | Read whole file |
| `server/src/modules/intent/constants.ts:6` `INTENT_TIMEOUT_MS = 30_000`, `:7` `INTENT_MAX_RETRIES = 1`, `:8` `INTENT_MAX_CHARS = 400`, `:27` `REFRESH_RATE_LIMIT` 10/min | Read whole file |
| `server/src/modules/intent/schemas.ts:71` `ScopeItem` `.max(SCOPE_ITEM_MAX_CHARS)`, `:73-79` `IntentOverrideBody` with `intent …max(INTENT_MAX_CHARS)`, arrays `.max(SCOPE_MAX_ITEMS)`, `.strict()` | Read whole file |
| `server/src/modules/intent/routes.ts:30-40` refresh with `config: { rateLimit: REFRESH_RATE_LIMIT }` (`:34`), `:42-49` PUT without rate limit | Read whole file |
| `server/src/modules/intent/repository.ts:162` "never names override_*", `:172-204` `saveFailure`, `:196` `setWhere: ne(status,'ok')`, `:199-203` zero-rows fallback to `get()`, `:79-106` `getPullContext` filters both workspaces | Read whole file |
| `server/src/modules/intent/ports.ts` has no imports from `src/platform/` | Read whole file |
| `server/src/modules/intent/domain/types.ts:119-133` `IntentStepInfo.cache` union and `ReviewIntentResult`; `domain/render.ts:194-212` `formatIntentStep` (`hit` → "computed earlier") / `formatIntentSkipped` | Grep `-A3`, Read 190-213 |
| `server/src/platform/container.ts:138-141` `intent` lazy singleton `new IntentService(this)`; no logger in the container | Read whole file |
| `server/src/modules/reviews/run-executor.ts:22-27` `Logger`, `:61` `logger?`, `:111-128` intent pre-work, `:112` `forReview` call, `:126` warn line, `:138-147` structured info example | Read 1-165 |
| `server/src/modules/reviews/routes.ts:29` per-route rate limit, `:41` `req.log` passed down; `server/src/modules/reviews/service.ts:46` `resolveTargets`, `:103-107` `runReview(…, logger?)` | Read 1-50; Read 60-139; Grep |
| `server/src/modules/settings/routes.ts:72` rate limit 20/min | Grep `rateLimit` |
| `server/src/modules/pulls/routes.ts:46` `app.log.warn({ err }, …)` | Grep `app.log` |
| `server/src/app.ts:49` `bodyLimit` 1 MiB, `:50-52` silent → logger off, `:78` single-instance NOTE, `:95-97` rate-limit plugin only when `nodeEnv !== 'test'`, global 120/min, `:116-127` Zod validation → **422** `validation_error`, `:159-163` fallback (`statusCode ?? 500`, code `internal_error`) | Read whole file |
| `server/src/platform/config.ts:32` `NODE_ENV` enum, `:76` log level default | Read whole file |
| `server/src/platform/errors.ts:21` NotFound **404**, `:27` Validation **422**, `:33` ExternalService **502** | Grep `super(` |
| **429** + `retry-after`: `@fastify/rate-limit@11.0.0/index.js:11` default hook `onRequest`, `:31-35` error with `statusCode` (429) and message "Rate limit exceeded, retry in …", `:142-157` per-route child store, `:317` `retry-after` header | Glob + Read 25-189 + Grep |
| `server/test/intent-routes.it.test.ts:17` test config `NODE_ENV: 'test'`, `:105` PUT invalid → **422**, `:152-171` 404 per verb, `:182` refresh failure → **502** | Read whole file |
| `server/test/intent-schemas.test.ts:56-59` 401-char intent / 9 items / 161-char item / unknown key rejected | Read whole file |
| `server/test/intent-service.test.ts:117` `new IntentService(deps)`, `:171-187` AC6, `:189-200` AC7 | Read whole file |
| `server/test/intent-review.it.test.ts:132-143` `appWith`, `:157-165` `runOnce`/`waitForPrRuns`, `:192` second run "cache hit" | Read 120-227 |
| `server/test/helpers/runs.ts:14` `waitForPrRuns`; `server/test/helpers/pg.ts` `startPg`/`dockerAvailable` | Grep; Read |
| `server/src/adapters/mocks.ts:83-85,99-101` mock `tokensIn: 100`, `costUsd: 0.001` | Grep |
| `server/.dependency-cruiser.cjs:29` DOMAIN includes `ports.ts`, `:40-55` `domain-is-pure` forbids `^src/platform/` | Read 1-58 |
| `server/specs/intent-layer.md` §4 lines 86-93, §5 lines 95-101, AC list 124-154 | Read 80-173 |
| `client/src/lib/api.ts:44-58` `ApiError(message, status, code)`; `client/src/lib/query-client.ts:26` `MutationCache`; `IntentCard.tsx:73-80` `handleSave` catch keeps form open | Read / Grep |
| No existing 429 / rate-limit test in `server/test` | Grep `rateLimit\|429` over `server/` |
| (T4) `server/src/app.ts:115-163` `setErrorHandler`, `:159` `app.log.error(err)` generic fallback, `:175` `return app` with no `ready()`; `server/test/routes-smoke.test.ts:11-15` no-DB `buildApp({ config })` harness | Read (main session, 2026-11-07) |
| (T5) `server/src/modules/intent/schemas.ts:35` `parseIntentSources`, `:29` `IntentSourceList`; `server/test/intent-schemas.test.ts:2` import line | Grep (main session, 2026-11-07) |

## Open questions — resolved (2026-11-07, user)

Decisions: OQ 1–5, 7, 9, 10 → the default below is accepted. **OQ6 → camelCase** (`prId`, `latencyMs`, `costUsd`, `tokensIn`, `tokensOut`) + `event: 'intent'`; C2, Design §3 and T2 are updated. **OQ8 → in scope as T4** (`rate_limited` code, warn level). Added **T5** (unit test for `parseIntentSources`). The original wording follows for reference.

1. **Negative-cache TTL.** **Default:** `INTENT_NEGATIVE_CACHE_TTL_MS = 60_000` (C3). A shorter TTL retries a flapping model sooner; a longer one saves more time when the model is down.
2. **Refresh vs. the negative cache.** **Default:** refresh bypasses it, clears it on success and re-arms it on failure (Design §2). The alternative is to make refresh also return 502 at once during the TTL, but then a user who just fixed the API key would be blocked for up to 60 s.
3. **Fall back to an older `ok` intent when the current head fails?** Today a failure on a new head means the review runs without intent, even if a stale `ok` row exists. **Default:** keep that behaviour (not in this plan). Using a stale intent changes review content, so it needs its own decision.
4. **PUT rate limit value.** **Default:** `OVERRIDE_RATE_LIMIT = 20/min` per client IP. That matches the precedent for the other cheap user write, `PUT /settings` (`settings/routes.ts:72`), and is more lenient than refresh's 10/min, which costs a model call. The alternative is to reuse `REFRESH_RATE_LIMIT` (10/min).
5. **Route-level max length for the override: no gap exists, so no task.**
   - Already enforced: route Zod `intent: z.string().trim().min(1).max(400)`, scope items `.max(160)`, at most 8 items each, `.strict()` (`schemas.ts:71-79`, wired as `schema.body` at `routes.ts:44`).
   - The service clamps again (`service.ts:75`, `:41-46`), and the request body is capped at 1 MiB (`app.ts:49`). Schema tests already prove the rejections (`intent-schemas.test.ts:56-59`), and invalid bodies return **422** (`intent-routes.it.test.ts:105`).
   - The only nuance: `.trim()` runs before `.max()`, so whitespace padding is accepted and stripped. The padded size is still bounded by the 1 MiB body limit.
   - **Default:** no work. Optionally add a route-level "401-char intent → 422" assertion as a non-RED regression test. Say if you want it in T3.
6. **Log field casing.** You asked for `latency_ms` / `cost_usd`. Existing pino fields in the executor are camelCase (`prId`, `durationMs`, `run-executor.ts:133-145`). **Default:** the intent record is fully snake_case (`pr_id`, `latency_ms`, `cost_usd`, `tokens_in`), matching the API/DB casing, plus `event: 'intent'` for filtering. The alternative is camelCase to match the executor.
7. **Joined runs in the Live Log.** **Default:** a run that joined another run's derivation shows the existing `Intent ready (cache hit) — … (computed earlier)` line (no change to `IntentStepInfo` / `formatIntentStep`). pino distinguishes it as `cache: 'joined'`. The alternative is a new `'shared'` step value with its own wording, which touches `domain/types.ts` and `domain/render.ts`.
8. **429 envelope.**
   - A rate-limit error has `statusCode: 429` but is neither an `AppError` nor a Zod error. So `app.ts:159-163` logs it at **error** level and returns `{ error: { code: 'internal_error', message: 'Rate limit exceeded, retry in 1 minute' } }` with status 429. This already happens today for refresh, review and settings.
   - **Default:** out of scope. Tests assert only the status code and `retry-after`.
   - A follow-up could map `statusCode === 429` to `code: 'rate_limited'` at warn level in the global handler. That touches `app.ts`, so it is a separate change.
9. **Rate-limit key.** `@fastify/rate-limit` keys by `req.ip` per route, not per PR or user (`index.js:29`). **Default:** accept it. DevDigest is local-first and single-user (no-auth mode), and per-route stores mean PUT bursts don't block refresh or GET.
10. **Gather before the negative-cache check.** The key includes `input_hash`, which exists only after gathering issues and docs (≤ 3 GitHub calls + ≤ 3 local reads per call, the same work a positive cache hit already does today). **Default:** keep the `(head_sha, input_hash)` key as requested, so a body or issue edit retries at once. The alternative is to key on `(head_sha, body_hash, model)` and check before gathering. It is cheaper while the model is down, but it ignores issue/doc edits for 60 s.
