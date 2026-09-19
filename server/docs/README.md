# Architecture: DevDigest API

## Layered module structure

The server is organized into four layers, each with distinct responsibilities:

**`src/platform`** — cross-cutting concerns shared by all modules:
- DI container (`container.ts`): instantiates adapters (LLM, GitHub, git, secrets, tokenizer, embedder) with singleton lifetime, mocked in tests
- error handling (`errors.js`): structured error envelope (`AppError`) serialized to the client
- configuration (`config.ts`): loads settings from `.env` (non-secret) and `SecretsProvider` (API keys); see [README.md:24–29](../README.md)
- logging (pino via Fastify)

**`src/adapters`** — ports for external integrations, swappable for mocks:
- `llm/`: OpenAI, Anthropic, OpenRouter providers (all implement `LLMProvider` interface; call Fastify's `container.llm(provider)`)
- `github/`: Octokit wrapper for PR import, comments, detail fetches
- `git/`: diff parsing; `MockGitClient` provides static diffs in tests
- `secrets/`: LocalSecretsProvider reads `~/.devdigest/secrets.json` (mode 0600); also falls back to `process.env`
- `embeddings/`: OpenAI embedder for vector storage (disabled by `EMBEDDINGS_ENABLED=false`)

**`src/modules/<kebab-case>`** — feature areas, each with `routes.ts` as the entry point:
- `repos/`: repo CRUD, polling, indexing state (imports from GitHub; see [routes.ts:1–23](../src/modules/repos/routes.ts))
- `pulls/`: PR import, sync, list, detail (see [routes.ts:14–22](../src/modules/pulls/routes.ts)); exports three reduce-on-read helpers: `deriveReviewStatus`, `totalCostByPr`, `findingsCountsByPr`
- `reviews/`: review trigger, SSE run events, trace read, finding actions (see [routes.ts:10–17](../src/modules/reviews/routes.ts))
- `agents/`: agent CRUD (create/list/update/delete)
- `settings/`, `workspace/`, `repoIntel/`: platform settings and workspace config

**`src/db`** — Drizzle ORM schema and migrations:
- `schema/` — all table definitions; `reviews.ts` defines the review/findings model (see below)
- `migrations/` — never hand-edited; always generated via `pnpm db:generate` (appended, never replaced)
- `seed.ts` — idempotent demo data: repo `acme/payments-api`, PR #482, and two built-in agents

## Review data model

Reviews and findings are stored in two linked tables (`src/db/schema/reviews.ts`):

### `reviews` table (lines 9–26)
- **`id`** (uuid, PK): unique review identifier
- **`workspaceId`** (uuid, FK → workspaces): workspace that owns this review
- **`prId`** (uuid, FK → pullRequests): which PR was reviewed
- **`agentId`** (uuid, nullable): which agent ran this review (null for legacy/manual reviews)
- **`runId`** (uuid, nullable): **links to `agent_runs.id`** — the timeline run that produced this review
- **`kind`** (enum): `'summary'` or `'review'`; distinguishes meta-reviews from detailed findings
- **`verdict`**, **`summary`**, **`score`**: the agent's verdict, narrative, and 0–100 quality score
- **`model`** (text): which LLM model generated this review (e.g., `gpt-4.1`, `claude-x`)
- **`createdAt`** (timestamp, default now): when the review was persisted

### `findings` table (lines 28–46)
- **`id`** (uuid, PK): unique finding identifier
- **`reviewId`** (uuid, FK → reviews): which review this finding belongs to; **cascade delete** removes findings when a review is deleted
- **`file`**, **`startLine`**, **`endLine`** (text/int): location in the diff; grounding phase filters findings whose span misses the diff hunks
- **`severity`**, **`category`**, **`kind`** (enums): CRITICAL/WARNING/SUGGESTION, bug/security/perf/style/test, and finding/secret_leak/lethal_trifecta/phantom/hook
- **`title`**, **`rationale`**, **`suggestion`** (text): what the issue is, why it matters, and how to fix it
- **`confidence`** (0–1 double): model's confidence in the finding
- **`trifectaComponents`** (jsonb): for lethal-trifecta findings, the security chain: private_data_access + untrusted_input + exfil_path (see `src/vendor/shared/contracts/findings.ts:29–34`)
- **`acceptedAt`**, **`dismissedAt`** (nullable timestamps): user actions; setting one clears the other

## The "reduce on read" pattern: PR list endpoint

The `GET /repos/:id/pulls` endpoint (`src/modules/pulls/routes.ts:28–208`) returns a **summary per PR** for the PR list UI, computed on read by three parallel reduce-on-read operations. This design avoids denormalization (no FK columns on `pull_requests`) while keeping the list fast (small fan-out, no N+1):

### Score: latest review per PR

Lines 116–132 of `routes.ts`:
```
1. Query: SELECT prId, score FROM reviews WHERE prId IN (prIds) ORDER BY createdAt DESC
2. JS reduce: for each prId, first-seen row is the latest review
3. Return: Map<prId, { score }>
```

The list is small enough (dozens of PRs per repo) that one IN-query + JS grouping beats a foreign key denorm. The SQL ordered by newest-first ensures the first row per PR wins.

### Cost: sum of every done run, not just latest batch

Lines 134–154 of `routes.ts`; implemented in `src/modules/pulls/total-cost.ts:11–26`:

**Criterion:** Cost represents cumulative spend reviewing this PR. When an agent runs twice on the same PR, the second run's cost adds to the total (not replaces it). This is intentional — cost is a financial tally, not a snapshot.

```
1. Query: SELECT prId, runId, costUsd FROM agent_runs 
          WHERE prId IN (prIds) AND status='done'
2. JS reduce: sum all costUsd per prId; a null cost leaves the prId as null
          (distinguishes "never priced" from "free runs" for future UI use)
3. Return: Map<prId, number | null>
```

See the unit tests (`server/test/total-cost.test.ts:20–26`): "sums across multiple batches / re-runs, not just the newest" — two runs on pr1 (0.01 + 0.02) sum to 0.03, proving cumulative behavior.

### Findings counts: each agent's latest review only

Lines 156–178 of `routes.ts`; implemented in `src/modules/pulls/findings-counts.ts:22–53`:

**Criterion:** A re-run replaces an agent's findings contribution, not adds to it. The rule mirrors the score column: latest review wins, grouped by agent. A finding is counted only from the latest review of that agent for that PR.

```
1. Query: SELECT prId, agentId, reviewId, severity FROM findings ⋈ reviews
          WHERE prId IN (prIds) AND kind='review' ORDER BY reviews.createdAt DESC
2. JS reduce: group by (prId, agentId); first-seen (reviewId, severity) pair for each group is current
3. Tally: call rollupSeverities() (shared helper, see below) per prId
4. Return: Map<prId, { CRITICAL?, WARNING?, SUGGESTION? }>
```

Test proof: `server/test/findings-counts.test.ts:31–38`, "ignores an older review from an agent once a newer one from that agent is seen" — rev2 (agent a1's latest) counted; rev1 (stale) skipped.

Integration test: `server/test/reviews.it.test.ts:318–350`, "list endpoint: findings_counts breaks down by severity from each agent's latest review; cost_usd sums every done run":
- Two runs from one agent on the same PR.
- findings_counts counts only the latest run's findings (exactly one CRITICAL).
- cost_usd sums both runs' costs (0.002 = 0.001 + 0.001).

## Code reuse: rollupSeverities helper

The findings-counts reducer demonstrates real code reuse. Instead of re-implementing severity tallying, `findingsCountsByPr` (line 44 of `findings-counts.ts`) calls the shared **`rollupSeverities`** helper from `status.ts:23–31`:

```typescript
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}
```

This function was originally written for the PR-list status badge (deriving review freshness: needs_review/reviewed/stale). The findings-counts layer discovered it was already solving the same counting problem and reused it, avoiding duplication. This is the pattern the codebase encourages: find and reuse, don't re-implement.

## Contract discipline: Zod schemas in vendor/shared

Every wire shape — request params, response bodies, data DTOs — is defined **once** as a Zod schema in `src/vendor/shared/contracts/*.ts` and manually duplicated into `client/src/vendor/shared/contracts/*.ts`. This is not a workspace symlink (see `server/CLAUDE.md:20`); both copies must be kept in sync by hand.

Example: `PrMeta` schema in `src/vendor/shared/contracts/platform.ts:157–188`:

```typescript
export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  score: z.number().int().nullish(),                    // latest review
  cost_usd: z.number().nullish(),                        // sum of all done runs
  findings_counts: z.object({                           // each agent's latest review
    CRITICAL: z.number().int().optional(),
    WARNING: z.number().int().optional(),
    SUGGESTION: z.number().int().optional(),
  }).nullish(),
});
```

The Fastify route validation pipeline (`fastify-type-provider-zod`) uses these schemas to:
1. Validate incoming request params/body → 422 if invalid
2. Serialize responses → ensure only declared fields are sent

This single schema is the source of truth for both validation (backend) and type inference (both frontend and backend TypeScript).

**Synchronization rule:** When the contract changes (e.g., adding a field to `PrMeta`), both files must be updated in the same PR. A diff check flags mismatches: `grep -A 5 "cost_usd" server/src/vendor/shared/contracts/platform.ts` and `grep -A 5 "cost_usd" client/src/vendor/shared/contracts/platform.ts` must be identical (modulo comments).
