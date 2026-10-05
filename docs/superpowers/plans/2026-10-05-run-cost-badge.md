# Run Cost Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each completed review run's real cost and token usage in the PR list (COST column, `$0.012`) and in the PR-detail verdict banner (`$0.014 – 8.2K → 1.3K`).

**Architecture:** `reviewer-core` already returns `costUsd` (real OpenRouter `usage.cost`, else the price-book estimate, else `null`) in `ReviewOutcome`, but `run-executor.ts` drops it. We persist it on `agent_runs.cost_usd`, expose it on two existing GET routes (`/pulls/:id/runs` per run; `/repos/:id/pulls` per PR = the run behind the PR's latest review, the same review the score ring uses), and render it with one shared client component `RunCostBadge` (variants `compact` and `banner`) in the PR list, the verdict banner and the PR timeline. No new model calls and no new client fetches.

**Tech Stack:** Fastify 5 + Drizzle (Postgres) + Zod contracts, Vitest (+ Testcontainers for `*.it.test.ts`); Next.js 15 / React 19 / next-intl / TanStack Query, Vitest + Testing Library.

**Spec:** `docs/labs/lab_1/task3/run_cost_badge.md`. Design: `docs/labs/lab_1/task3/DevDigest Design (standalone).html`. The design's `CostBadge` is cost in secondary colour, then tokens in a muted span. `PRRow` has a 76px Cost column after Status. `VerdictBanner` puts a `$` icon and the badge under the score with a top border. Sample: `VERDICT.cost = 0.014, tokens_in = 8200, tokens_out = 1300`.

## Global Constraints

- Every completed run (`status = 'done'`) renders a badge. (spec §1 Requirements)
- A run with no cost data renders `--`, never `$0.00`. (spec §1)
- Zero additional model calls to obtain cost/tokens. (spec §1)
- Cost shown must equal the persisted run value, which is the same number written to the run log. Cost source order: OpenRouter `usage.cost` → price-book estimate → `null`. (spec §2 Accuracy)
- Readable format: `$0.012`, not `$0.01`. (spec §2 Formatting)
- Incomplete runs (running / failed / cancelled) show no price. (spec §2)
- List format `$0.012`; banner format `$0.014 – 8.2K → 1.3K`. (spec §1)
- Client user-visible strings go through next-intl (`client/messages/en/prReview.json`). (client/CLAUDE.md)
- Never hand-edit `server/src/db/migrations/`; edit `src/db/schema/runs.ts`, then `pnpm db:generate`. (CLAUDE.md)
- No lint/format command exists; do not add one. Finish with `node scripts/check-claude-md.mjs`. (CLAUDE.md)
- Before starting any task, read the module's `INSIGHTS.md` (`server/INSIGHTS.md`, `client/INSIGHTS.md`). (CLAUDE.md)
- Component folders: `<Name>/<Name>.tsx`, `index.ts`, colocated `<Name>.test.tsx`. Server tests are `test/*.test.ts` (hermetic) or `test/*.it.test.ts` (Docker). (module CLAUDE.md files)

## Decisions (approved before execution)

1. **Vendored contracts are edited — needs explicit user OK before Task 1 starts.** `server/src/vendor/shared` and `client/src/vendor/shared` hold the Zod contracts (`RunSummary`, `PrMeta`, `RunStats`). Both CLAUDE.md files say "do not edit it here", but route schemas may not be redefined locally. Tasks 1-2 edit **both copies identically, adding fields only**. (`platform.ts` copies are identical; the `trace.ts` copies differ only in comments in `PromptAssembly`.)
2. **PR-list cost = cost of the run that produced the PR's latest review.** This is the same review the score ring uses, so list cost, list score and the top banner always describe the same run (the design's PR #482 shows `$0.014` in both places). It is not a sum over agents. If that run is not `done`, is gone, or has no cost, the list shows `--`.
3. **Empty marker is `--`** (spec text). The design mock uses `—`; the spec wins.
4. **Format rule.** The spec says "≥ 3 significant digits" but its own example `$0.012` has two.
   - `>= $1`: 2 decimals (`$1.50`).
   - `$0.01–$1`: 3 decimals (`$0.012`).
   - `$0.0001–$0.01`: 2 significant digits (`$0.0013`, never `$0.001`).
   - Below that: `<$0.0001`.
   - A real zero (free model): `$0.000`, which is distinct from `--`.
5. **Old runs are not backfilled.** Runs before migration 0010 have `cost_usd = NULL` and show `--`. Recomputing from tokens × today's prices wouldn't match what OpenRouter billed.

## Review Focus

These are failure modes the spec implies but no happy path covers, most likely first. Each has a test in the task that owns the code.

1. **A failed, cancelled or running run** shows no price: NULL in the DB, no badge in the timeline, `--` in the list. Tests: Task 1 (failed-run integration test), Task 2 (helper: non-`done` run gives null), Task 4 (timeline).
2. **Unknown model with no `usage.cost` and no price entry** gives `costUsd = null`, shown as `--`, not `$0.000`. Tests: Task 3 (`formatCostUsd(null)`), Task 1 (NULL is persisted, not 0).
3. **A tiny real cost** (`0.0013` in the design data) never rounds to `$0.00` or `$0.001`, in the UI or the run log. Tests: Task 3; the Task 1 log line uses 6 decimals.
4. **The PR list never disagrees with the score next to it.** It shows `--` for a PR with no review, or whose latest review's run is missing or unfinished. A deleted review must not leave its cost on the row. Test: Task 2.
5. **Pre-migration runs and legacy traces** (no `cost_usd` in `run_traces.trace.stats`) still parse and show `--`. Tests: Task 1 (contract parses a legacy `stats`), Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/src/db/schema/runs.ts` (modify) | `agentRuns.costUsd` column |
| `server/src/db/migrations/0010_*` (generated) | `ALTER TABLE agent_runs ADD COLUMN cost_usd double precision` |
| `server/src/modules/reviews/repository/run.repo.ts`, `.../repository.ts` (modify) | write `costUsd` on completion; return `cost_usd` in run history |
| `server/src/modules/reviews/run-executor.ts` (modify) | pass `outcome.costUsd` through; trace stats + persisted log line |
| `server/src/vendor/shared/contracts/{trace,platform}.ts` + `client/src/vendor/shared/contracts/{trace,platform}.ts` (modify) | `RunStats.cost_usd`, `RunSummary.cost_usd`, `PrMeta.cost_usd` |
| `server/src/modules/pulls/run-cost.ts` (create) | pure `costOfLatestReviewRun` |
| `server/src/modules/pulls/routes.ts` (modify) | add `cost_usd` to the PR list |
| `client/src/components/run-cost-badge/{format.ts,RunCostBadge.tsx,index.ts,RunCostBadge.test.tsx}` (create) | formatting and the 2-variant component |
| `client/messages/en/prReview.json` (modify) | `list.columns.cost`, `cost.*` |
| `client/src/app/repos/[repoId]/pulls/{constants.ts}`, `_components/PRRow/*` | COST column |
| `…/[number]/_components/{FindingsTab,ReviewRunAccordion,VerdictBanner,RunHistory}/*` | banner + timeline badge |
| `server/INSIGHTS.md`, `client/INSIGHTS.md` | session findings |

---

### Task 1: Persist run cost (server)

**Files:**
- Modify: `server/src/db/schema/runs.ts:1,19-20`
- Generate: `server/src/db/migrations/0010_*.sql` + `meta/` (drizzle-kit only)
- Modify: `server/src/modules/reviews/repository/run.repo.ts` (`listRunsForPull` ~l.47-66, `completeAgentRun` ~l.141-175)
- Modify: `server/src/modules/reviews/repository.ts:150-165`
- Modify: `server/src/modules/reviews/run-executor.ts:213` (destructure), `:243-253` (completeAgentRun), `:262-269` (trace stats), `:283-285` (log)
- Modify (identical edit in both): `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:16-34` (fixture gains `cost_usd`)
- Test: `server/test/reviews.it.test.ts`, `server/test/contracts.test.ts`

**Interfaces:**
- Consumes: `ReviewOutcome.costUsd: number | null` (`reviewer-core/src/review/run.ts:110`).
- Produces:
  - Column `agent_runs.cost_usd double precision NULL` → Drizzle `agentRuns.costUsd: number | null`.
  - `completeAgentRun(runId, values)` takes optional `costUsd?: number | null` (omitted ⇒ NULL).
  - `RunStats.cost_usd?: number | null` (nullish), `RunSummary.cost_usd: number | null`.

- [ ] **Step 1: Write the failing tests**

In `server/test/reviews.it.test.ts`, add near the top (after `config`):

```ts
/** `completeAgentRun` (status done, which ends waitForPrRuns) runs before
 *  `saveRunTrace`, so poll until the trace document exists. */
async function fetchTrace(app: { inject: (o: { method: 'GET'; url: string }) => Promise<{ statusCode: number; json: () => any }> }, runId: string) {
  for (let i = 0; i < 200; i++) {
    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    if (res.statusCode === 200 && res.json()?.stats) return res.json();
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`trace for ${runId} never persisted`);
}
```

In the first test (`runs a review: map-reduce + grounding…`), replace
`const trace = (await app.inject({ method: 'GET', url: \`/runs/${runId}/trace\` })).json();`
with `const trace = await fetchTrace(app, runId);`, and after `expect(run!.grounding).toBe('1/2 passed');` add:

```ts
    // cost: MockLLMProvider reports costUsd 0.001 / 100 in / 50 out per call; the
    // single-file DIFF is one single-pass call, so the run's cost is exactly that.
    expect(run!.costUsd).toBeCloseTo(0.001, 10);
    expect(run!.tokensIn).toBe(100);
    expect(run!.tokensOut).toBe(50);
    expect(trace.stats.cost_usd).toBeCloseTo(0.001, 10);
    // the persisted run log carries the same number
    expect(trace.log.map((l: { msg: string }) => l.msg).join('\n')).toContain('$0.001000');

    const history = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(history[0].cost_usd).toBeCloseTo(0.001, 10);
```

Add a new test right after it in the same `d(...)` block:

```ts
  it('a failed run stores NULL cost (never 0)', async () => {
    // fixture violates the Review schema → MockLLMProvider throws → run fails
    const app = await appWith({ not: 'a review' });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Failing', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.costUsd).toBeNull();

    const history = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(history[0].cost_usd).toBeNull();
    await app.close();
  });
```

In `server/test/contracts.test.ts`, add `RunStats` to the existing `@devdigest/shared` import, and append:

```ts
describe('RunStats cost_usd', () => {
  it('parses a legacy stats object without cost_usd, and one with null', () => {
    const base = { duration_ms: 1, tokens_in: 2, tokens_out: 3, findings: 0, grounding: '0/0 passed' };
    expect(RunStats.parse(base).cost_usd).toBeUndefined();
    expect(RunStats.parse({ ...base, cost_usd: null }).cost_usd).toBeNull();
    expect(RunStats.parse({ ...base, cost_usd: 0.014 }).cost_usd).toBe(0.014);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- `cd server && pnpm exec vitest run test/contracts.test.ts`. The new case FAILS: zod strips the unknown key, so `toBeNull` and `toBe(0.014)` fail.
- `cd server && pnpm exec vitest run test/reviews.it.test.ts`. The new assertions FAIL (`costUsd` undefined). This needs Docker running; without it the suite skips.

- [ ] **Step 3: Implement**

`server/src/db/schema/runs.ts`: add `doublePrecision` to the `drizzle-orm/pg-core` import. After `tokensOut`, add:

```ts
  /** Real USD cost of the run (OpenRouter usage.cost, else price-book estimate).
   *  NULL = unknown / run not completed — never 0 as a stand-in. */
  costUsd: doublePrecision('cost_usd'),
```

Generate the migration (never hand-edit):

```bash
cd server && pnpm db:generate
git status --short src/db/migrations     # one new 0010_*.sql + meta/_journal.json + meta/0010_snapshot.json
cat src/db/migrations/0010_*.sql          # must be exactly: ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

If the dev DB is up (`docker compose up -d`, `DATABASE_URL` set), also run `pnpm db:migrate`. The integration tests migrate their own container and do not need it.

`run.repo.ts` changes:
- In the `completeAgentRun` values type, add `/** USD cost; null/omitted ⇒ unknown. */ costUsd?: number | null;`.
- In `.set({...})`, add `costUsd: values.costUsd ?? null,`.
- In `listRunsForPull`, add `cost_usd: run.costUsd,` after `tokens_out`.

`repository.ts`: add the same `costUsd?: number | null;` to the `completeAgentRun` facade values type.

`run-executor.ts` changes:
- Change `const { tokensIn, tokensOut, grounding } = outcome;` to `const { tokensIn, tokensOut, costUsd, grounding } = outcome;`.
- Add `costUsd,` after `tokensOut,` in the `completeAgentRun` call.
- Add `cost_usd: costUsd,` to the trace `stats` object.
- Insert the new log line **before** the `const trace: RunTrace = {` literal. `log: runLog.logFor(runId)` copies the buffer at that moment, so any line logged later is never persisted:

```ts
      // Logged BEFORE the trace is built: logFor() snapshots the buffer, so this
      // line is persisted and matches agent_runs.cost_usd exactly.
      runLog.result(
        `Run complete · ${tokensIn} in / ${tokensOut} out tokens · ` +
          (costUsd == null ? 'cost unknown' : `$${costUsd.toFixed(6)}`),
      );
```

  Keep the existing `runLog.info('Run complete; trace persisted');` as it is. The failure path already omits `costUsd`, which stores NULL; leave it alone.

Contracts, **identical edit in both** `trace.ts` copies. In `RunStats`, after `grounding`:

```ts
  /** USD cost of the run; absent on legacy traces, null when unknown. */
  cost_usd: z.number().nullish(),
```

In `RunSummary`, after `tokens_out`:

```ts
  /** USD cost; null for unfinished runs and runs with no cost data. */
  cost_usd: z.number().nullable(),
```

`RunHistory.test.tsx` fixture `run()`: add `cost_usd: null,` after `blockers: null,`. The field is now required, and the client typecheck covers `*.test.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts test/reviews.it.test.ts
cd ../client && pnpm typecheck && pnpm exec vitest run src/app/repos
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema/runs.ts server/src/db/migrations server/src/modules/reviews \
  server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts \
  "client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx" server/test
git commit -m "feat(server): persist per-run cost on agent_runs and expose it in run history"
```

---

### Task 2: PR-list cost (server)

**Files:**
- Create: `server/src/modules/pulls/run-cost.ts`
- Modify: `server/src/modules/pulls/routes.ts:114-155` (latest-review block + returned object)
- Modify (identical edit in both): `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts` (`PrMeta`)
- Test: `server/test/pulls-run-cost.test.ts` (hermetic), `server/test/reviews.it.test.ts`

**Interfaces:**
- Consumes: `agentRuns.costUsd` (Task 1); `reviews.runId` (`server/src/db/schema/reviews.ts:19`, no FK).
- Produces:
  - `export interface RunCostRow { id: string; status: string | null; costUsd: number | null }`
  - `export function costOfLatestReviewRun(latestRunIdByPr: Map<string, string | null>, runs: RunCostRow[]): Map<string, number | null>`. It returns one entry per PR in the input map: the run's `costUsd` if that run exists and is `done`, else `null`.
  - `PrMeta.cost_usd?: number | null` (nullish; list endpoint only).

- [ ] **Step 1: Write the failing tests**

`server/test/pulls-run-cost.test.ts`:

```ts
/**
 * PR-list cost (`modules/pulls/run-cost.ts`): the COST cell shows the cost of
 * the run behind the PR's latest review — the same review the score ring uses —
 * so cost and score never describe different runs.
 */
import { describe, it, expect } from 'vitest';
import { costOfLatestReviewRun, type RunCostRow } from '../src/modules/pulls/run-cost.js';

const run = (o: Partial<RunCostRow> & { id: string }): RunCostRow => ({ status: 'done', costUsd: 0.01, ...o });

describe('costOfLatestReviewRun', () => {
  it("returns the latest review's run cost", () => {
    const m = costOfLatestReviewRun(new Map([['pr1', 'r2']]), [
      run({ id: 'r1', costUsd: 0.5 }),
      run({ id: 'r2', costUsd: 0.014 }),
    ]);
    expect(m.get('pr1')).toBe(0.014);
  });

  it('a run that is not done never shows a price', () => {
    for (const status of ['failed', 'cancelled', 'running', null]) {
      const m = costOfLatestReviewRun(new Map([['pr1', 'r1']]), [run({ id: 'r1', status, costUsd: 0.3 })]);
      expect(m.get('pr1')).toBeNull();
    }
  });

  it('unknown cost stays null; a missing run (deleted) or a review without run_id is null', () => {
    const m = costOfLatestReviewRun(
      new Map<string, string | null>([['a', 'r1'], ['b', 'gone'], ['c', null]]),
      [run({ id: 'r1', costUsd: null })],
    );
    expect(m.get('a')).toBeNull();
    expect(m.get('b')).toBeNull();
    expect(m.get('c')).toBeNull();
  });

  it('keeps a real zero (free model) as 0, distinct from null', () => {
    expect(costOfLatestReviewRun(new Map([['pr1', 'r1']]), [run({ id: 'r1', costUsd: 0 })]).get('pr1')).toBe(0);
  });

  it('PRs without a review are absent', () => {
    expect(costOfLatestReviewRun(new Map(), [run({ id: 'r1' })]).size).toBe(0);
  });
});
```

`server/test/reviews.it.test.ts` changes:
- Import `MockGitHubClient` from `../src/adapters/mocks.js`.
- In `appWith` overrides, add `github: new MockGitHubClient(),`. This keeps `GET /repos/:id/pulls` hermetic even when `~/.devdigest/secrets.json` or `GITHUB_TOKEN` exists (same idiom as `test/integration.it.test.ts:120`).
- In the first test, change `const { pr } = await setupRepoAndPr(...)` to `const { repo, pr } = …`, and before `await app.close()` add:

```ts
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const row = list.find((p: { id: string }) => p.id === pr.id);
    expect(row.cost_usd).toBeCloseTo(0.001, 10);
    expect(row.score).toBe(65); // same review → same run as the cost
```

In the failed-run test, also destructure `repo` and before `await app.close()` add:

```ts
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    expect(list.find((p: { id: string }) => p.id === pr.id).cost_usd).toBeNull();
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && pnpm exec vitest run test/pulls-run-cost.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`server/src/modules/pulls/run-cost.ts`:

```ts
/**
 * Cost for the PR list: the cost of the run that produced the PR's latest
 * review — the same review the score ring is taken from — so the list's cost and
 * score always describe one run. A run that isn't `done`, no longer exists, or
 * has unknown cost yields null (rendered "--"), never another run's number.
 */
export interface RunCostRow {
  id: string;
  status: string | null;
  costUsd: number | null;
}

export function costOfLatestReviewRun(
  latestRunIdByPr: Map<string, string | null>,
  runs: RunCostRow[],
): Map<string, number | null> {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const out = new Map<string, number | null>();
  for (const [prId, runId] of latestRunIdByPr) {
    const r = runId ? byId.get(runId) : undefined;
    out.set(prId, r && r.status === 'done' ? r.costUsd : null);
  }
  return out;
}
```

`routes.ts` changes:
- Add `import { costOfLatestReviewRun } from './run-cost.js';`.
- Widen the latest-review map to also carry `runId`:

```ts
    const latestReviewByPr = new Map<string, { score: number | null; runId: string | null }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score, runId: t.reviews.runId })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score, runId: rv.runId });
      }
    }

    // COST = the run behind that same latest review (see run-cost.ts).
    const latestRunIdByPr = new Map([...latestReviewByPr].map(([prId, v]) => [prId, v.runId]));
    const runIds = [...new Set([...latestRunIdByPr.values()].filter((id): id is string => id != null))];
    const runRows =
      runIds.length > 0
        ? await container.db
            .select({ id: t.agentRuns.id, status: t.agentRuns.status, costUsd: t.agentRuns.costUsd })
            .from(t.agentRuns)
            .where(inArray(t.agentRuns.id, runIds))
        : [];
    const costByPr = costOfLatestReviewRun(latestRunIdByPr, runRows);
```

- In the returned object, after `score: …`, add `cost_usd: costByPr.get(r.id) ?? null,`.

`PrMeta` in **both** `platform.ts` copies, after `score`:

```ts
  // Cost (USD) of the run behind the latest review (list endpoint only; null/absent = no data).
  cost_usd: z.number().nullish(),
```

- [ ] **Step 4: Run to verify pass**

```bash
cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run test/reviews.it.test.ts
cd ../client && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pulls server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts server/test
git commit -m "feat(server): serve the latest review's run cost on the PR list"
```

---

### Task 3: `RunCostBadge` component + formatters (client)

**Files:**
- Create: `client/src/components/run-cost-badge/format.ts`, `RunCostBadge.tsx`, `index.ts`, `RunCostBadge.test.tsx`
- Modify: `client/messages/en/prReview.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure props).
- Produces:
  - `formatCostUsd(usd: number | null | undefined): string`. Returns `"--"` for null, undefined, NaN or negative.
  - `formatTokens(n: number | null | undefined): string`. Returns `"--"` for null.
  - `<RunCostBadge variant="compact" | "banner" costUsd={number|null|undefined} tokensIn?={number|null} tokensOut?={number|null} />`. The root `<span>` has `title` `"Cost of this run"` when cost is known and `"No cost data"` otherwise. Tests locate it with `getByTitle`.
  - i18n keys under `prReview`: `list.columns.cost`, `cost.none`, `cost.title`, `cost.noneTitle`, `cost.tokens`.

- [ ] **Step 1: Write the failing tests**

`client/src/components/run-cost-badge/RunCostBadge.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCostUsd, formatTokens } from "./format";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCostUsd", () => {
  it("keeps enough digits to read: $0.012 not $0.01", () => {
    expect(formatCostUsd(0.012)).toBe("$0.012");
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.041)).toBe("$0.041");
    expect(formatCostUsd(0.5)).toBe("$0.500");
  });
  it("never collapses a tiny real cost to $0.00 / $0.001", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.0013");
    expect(formatCostUsd(0.00999)).toBe("$0.010");
    expect(formatCostUsd(0.00002)).toBe("<$0.0001");
  });
  it("uses cents above $1, including values that round up to $1", () => {
    expect(formatCostUsd(1.5)).toBe("$1.50");
    expect(formatCostUsd(0.9996)).toBe("$1.00");
  });
  it("a real zero is $0.000, but no data is --", () => {
    expect(formatCostUsd(0)).toBe("$0.000");
    expect(formatCostUsd(null)).toBe("--");
    expect(formatCostUsd(undefined)).toBe("--");
    expect(formatCostUsd(Number.NaN)).toBe("--");
    expect(formatCostUsd(-1)).toBe("--");
  });
});

describe("formatTokens", () => {
  it("compacts to K / M with one decimal", () => {
    expect(formatTokens(8200)).toBe("8.2K");
    expect(formatTokens(1300)).toBe("1.3K");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1_250_000)).toBe("1.3M");
    expect(formatTokens(999_990)).toBe("1.0M");
    expect(formatTokens(null)).toBe("--");
  });
});

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    renderWithIntl(<RunCostBadge variant="compact" costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.012");
  });
  it("banner: cost – tokens in → tokens out, tokens in their own muted span", () => {
    renderWithIntl(<RunCostBadge variant="banner" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.014 – 8.2K → 1.3K");
    expect(screen.getByText("– 8.2K → 1.3K").tagName).toBe("SPAN");
  });
  it("banner without token counts shows the cost alone", () => {
    renderWithIntl(<RunCostBadge variant="banner" costUsd={0.014} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.014");
  });
  it.each(["compact", "banner"] as const)("%s: no cost data renders -- and never $0.00", (variant) => {
    renderWithIntl(<RunCostBadge variant={variant} costUsd={null} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("No cost data").textContent).toBe("--");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && pnpm exec vitest run src/components/run-cost-badge`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`client/messages/en/prReview.json` changes:
- Add `"cost": "Cost"` to `list.columns`, between `status` and `updated`.
- Add a new top-level block next to `verdict`:

```json
  "cost": {
    "none": "--",
    "title": "Cost of this run",
    "noneTitle": "No cost data",
    "tokens": "– {tokensIn} → {tokensOut}"
  },
```

`format.ts`:

```ts
/** Formatting for run cost / token usage. `--` means "no data" and is never `$0.00`. */
export const NO_DATA = "--";

/** USD for a run. >= $1: cents; $0.01-$1: 3 decimals ($0.012); below that 2
 *  significant digits ($0.0013) so a real small cost never rounds to $0.00;
 *  below $0.0001: "<$0.0001". A real 0 (free model) is "$0.000". */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return NO_DATA;
  if (usd === 0) return "$0.000";
  if (Number(usd.toFixed(3)) >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  if (usd >= 0.0001) return `$${usd.toPrecision(2)}`;
  return "<$0.0001";
}

/** Compact token count: 950 → "950", 8200 → "8.2K", 1_250_000 → "1.3M". */
export function formatTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return NO_DATA;
  if (n >= 999_950) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}
```

`RunCostBadge.tsx`:

```tsx
/* RunCostBadge — a run's cost (and, in the banner, token usage). Ported from
   the design's CostBadge.
   compact → "$0.012" (PR list COST column, timeline rows)
   banner  → "$0.014 – 8.2K → 1.3K" (verdict banner; tokens in a muted span)
   No cost data renders "--" (never $0.00); tokens are only shown next to a real cost. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { NO_DATA, formatCostUsd, formatTokens } from "./format";

export type RunCostBadgeVariant = "compact" | "banner";

const s = {
  cost: (variant: RunCostBadgeVariant): CSSProperties => ({
    fontSize: variant === "banner" ? 13 : 11.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
  }),
  tokens: { fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
  none: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};

export function RunCostBadge({
  variant,
  costUsd,
  tokensIn,
  tokensOut,
}: {
  variant: RunCostBadgeVariant;
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("prReview");
  const cost = formatCostUsd(costUsd);
  if (cost === NO_DATA) {
    return (
      <span className="mono" style={s.none} title={t("cost.noneTitle")}>
        {t("cost.none")}
      </span>
    );
  }
  const showTokens = variant === "banner" && tokensIn != null && tokensOut != null;
  return (
    <span className="mono tnum" style={s.cost(variant)} title={t("cost.title")}>
      {cost}
      {showTokens && (
        <>
          {" "}
          <span style={s.tokens}>
            {t("cost.tokens", { tokensIn: formatTokens(tokensIn), tokensOut: formatTokens(tokensOut) })}
          </span>
        </>
      )}
    </span>
  );
}

export default RunCostBadge;
```

`index.ts`:

```ts
export { RunCostBadge, default } from "./RunCostBadge";
export { formatCostUsd, formatTokens } from "./format";
```

- [ ] **Step 4: Run to verify pass**

Run: `cd client && pnpm exec vitest run src/components/run-cost-badge && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/run-cost-badge client/messages/en/prReview.json
git commit -m "feat(client): add RunCostBadge (compact + banner) and cost formatters"
```

---

### Task 4: Show the badge in the PR list, verdict banner and timeline (client)

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/constants.ts` (`GRID`, `COLUMN_KEYS`)
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- Create: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`
- Modify: `…/[number]/_components/VerdictBanner/{VerdictBanner.tsx,styles.ts,VerdictBanner.test.tsx}`
- Modify: `…/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`, `…/FindingsTab/FindingsTab.tsx`
- Modify: `…/[number]/_components/RunHistory/{RunHistory.tsx,RunHistory.test.tsx}`

**Interfaces:**
- Consumes: `RunCostBadge` (Task 3), `PrMeta.cost_usd` (Task 2), and `RunSummary.cost_usd/tokens_in/tokens_out` (Task 1). Both contracts are already in the client's `@devdigest/shared`.
- Produces:
  - `VerdictBanner` gains optional props `costUsd?: number | null; tokensIn?: number | null; tokensOut?: number | null`.
  - `ReviewRunAccordion` gains an optional prop `run?: RunSummary | null`.

Every completed run gets a badge. The timeline (`RunHistory`) lists every run without expanding anything, so each `done` row there gets a compact badge. The expanded review shows the banner variant.

- [ ] **Step 1: Write the failing tests**

`PRRow.test.tsx` (the `next/navigation` mock matches `RunReviewDropdown.test.tsx:6`):

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import type { PrMeta } from "@/lib/types";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

const pr = (over: Partial<PrMeta>): PrMeta => ({
  number: 482, title: "Add rate limiting", author: "marisa.koch", branch: "f", base: "main",
  head_sha: "abc", additions: 10, deletions: 2, files_count: 1, status: "reviewed",
  updated_at: new Date().toISOString(), score: 61, ...over,
});

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow cost column", () => {
  it("shows the compact cost of the latest review's run", () => {
    renderRow(pr({ cost_usd: 0.012 }));
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });
  it("shows -- when the PR has no cost data (unreviewed, or cost unknown)", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
  it("shows -- when cost_usd is absent from the payload", () => {
    renderRow(pr({}));
    expect(screen.getByText("--")).toBeInTheDocument();
  });
});
```

(The unreviewed score cell renders `—`, an em dash, which differs from `--`, so `getByText("--")` stays unique. `relativeTime(now)` renders `now`.)

Append to the `describe` in `VerdictBanner.test.tsx`:

```tsx
  it("shows cost and token usage in the banner row", () => {
    renderWithIntl(
      <VerdictBanner verdict="request_changes" summary="s" score={61} findingsCount={6} blockers={2}
        costUsd={0.014} tokensIn={8200} tokensOut={1300} />,
    );
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.014 – 8.2K → 1.3K");
  });

  it("shows -- (not $0.00) when the run has no cost data", () => {
    renderWithIntl(
      <VerdictBanner verdict="comment" summary="s" score={90} findingsCount={0} blockers={0}
        costUsd={null} tokensIn={8200} tokensOut={1300} />,
    );
    expect(screen.getByTitle("No cost data").textContent).toBe("--");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
```

Append to `RunHistory.test.tsx`:

```tsx
describe("RunHistory — cost badge", () => {
  it("a done run shows its compact cost", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95, cost_usd: 0.012 })]);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("a done run without cost data shows --", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95, cost_usd: null })]);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it.each(["failed", "running", "cancelled"])("a %s run shows no price at all", (status) => {
    renderRuns([run({ status, error: status === "failed" ? "boom" : null, score: null, cost_usd: 0.5 })]);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && pnpm exec vitest run src/app/repos`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`constants.ts`:
- Set `export const GRID = "1fr 132px 92px 60px 118px 76px 78px";`.
- Set `COLUMN_KEYS` to `["pullRequest","author","size","score","status","cost","updated"]`. `page.tsx` maps these into the header, so it needs no change.

`PRRow.tsx`: add `import { RunCostBadge } from "@/components/run-cost-badge";`. Between the status `<div>` and the updated `<div>`, add:

```tsx
      <div>
        <RunCostBadge variant="compact" costUsd={pr.cost_usd} />
      </div>
```

`VerdictBanner.tsx`:
- Import `RunCostBadge` from `@/components/run-cost-badge`.
- Add the three optional props to the destructuring and its type (`costUsd?: number | null; tokensIn?: number | null; tokensOut?: number | null;`).
- Replace the `{score != null && (<div style={s.scoreCol}>…</div>)}` block with:

```tsx
      <div style={s.scoreCol}>
        {score != null && (
          <>
            <CircularScore score={score} size={52} stroke={5} />
            <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
          </>
        )}
        <div style={s.costRow}>
          <Icon.DollarSign size={11} style={s.costIcon} />
          <RunCostBadge variant="banner" costUsd={costUsd} tokensIn={tokensIn} tokensOut={tokensOut} />
        </div>
      </div>
```

`VerdictBanner/styles.ts` (matches the design: top border, 5px gap). Add:

```ts
  costRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  costIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
```

`ReviewRunAccordion.tsx`:
- Add `RunSummary` to the `@devdigest/shared` type import.
- Add the prop `/** This review's agent_runs row (supplies cost/tokens). */ run?: RunSummary | null;` to the destructuring and type.
- Pass these to `<VerdictBanner …>`:

```tsx
                costUsd={run?.cost_usd ?? null}
                tokensIn={run?.tokens_in ?? null}
                tokensOut={run?.tokens_out ?? null}
```

`FindingsTab.tsx`: in the `runs.map`, add `run={prRuns?.find((r) => r.run_id === review.run_id) ?? null}` to `<ReviewRunAccordion …>`. `prRuns` is the existing `/pulls/:id/runs` query, so this adds no new fetch.

`RunHistory.tsx`:
- Import `RunCostBadge` from `@/components/run-cost-badge`.
- In the right-hand column `<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", … }}>`, add before the time:

```tsx
              {settled && <RunCostBadge variant="compact" costUsd={r.cost_usd} />}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd client && pnpm typecheck && pnpm test`. Expected: PASS. The existing `VerdictBanner` smoke test and the `RunHistory` outcome tests keep passing: the new props are optional, and the new `--` doesn't collide with their assertions.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): show run cost in the PR list, verdict banner and run timeline"
```

---

### Task 5: Verify end to end, record insights

**Files:**
- Modify: `server/INSIGHTS.md`, `client/INSIGHTS.md` (via the `engineering-insights` skill)

- [ ] **Step 1: Full verification**

```bash
cd server && pnpm typecheck && pnpm test
cd ../client && pnpm typecheck && pnpm test
cd .. && node scripts/check-claude-md.mjs
```

Expected: all green.

- [ ] **Step 2: Accuracy check against a real run (manual; needs an OpenRouter key and the dev DB migrated)**

Run `./scripts/dev.sh` (and `cd server && pnpm db:migrate` if it was not done in Task 1). Review one PR with an OpenRouter model, then confirm the same number appears in each of these:
- the PR-list COST cell;
- the verdict banner;
- the timeline row;
- `agent_runs.cost_usd`: `select cost_usd, tokens_in, tokens_out from agent_runs order by ran_at desc limit 1;`;
- the run log's `Run complete · … · $x.xxxxxx` line in the trace drawer.

Compare with that generation on the OpenRouter activity page; they should agree to the displayed precision. Confirm that a pre-migration run shows `--`, and that a failed run shows no price.

- [ ] **Step 3: Record findings**

Invoke the `engineering-insights` skill and add entries in its exact format (`- YYYY-MM-DD Fact, the action to take, and why. Applies to path/file.ext:LINE.`), using the real line numbers after implementation. For example:
- **server:** `agent_runs.cost_usd` is NULL for runs before migration 0010 and for non-`done` runs, and the PR list takes cost from the latest review's run. Don't backfill from tokens × price, or old figures won't match the bill. Applies to `src/modules/pulls/run-cost.ts:LINE`.
- **server:** `runLog.logFor()` snapshots the buffer, so anything logged after the trace literal is never persisted. Applies to `src/modules/reviews/run-executor.ts:LINE`.
- **client:** `RunSummary`/`PrMeta` in `@devdigest/shared` were edited in both vendor copies; keep them identical. Applies to `src/vendor/shared/contracts/trace.ts:LINE`.

- [ ] **Step 4: Commit**

```bash
git add server/INSIGHTS.md client/INSIGHTS.md
git commit -m "docs: record run-cost-badge insights"
```

---

## Self-Review

- **Spec coverage:**
  - COST column: Tasks 2 and 4.
  - Banner row: Tasks 1 and 4.
  - Data source and real OpenRouter cost: Task 1 uses `outcome.costUsd`, which takes `usage.cost` and falls back to the price book (`reviewer-core/src/llm/openrouter.ts:94-97`, `run.ts:184`, `container.ts:185-188`).
  - Server per-run data and GET routes: Tasks 1 and 2.
  - `RunCostBadge` with 2 variants: Task 3.
  - Every completed run has a badge: Task 4 (timeline row for every `done` run, plus the banner).
  - `--` for no data: Tasks 3 and 4.
  - No extra model calls or fetches: Task 4 reuses the existing queries.
  - Accuracy vs the run log: Task 1 logs the same value before the trace snapshot, and its test asserts it. Task 5 checks against OpenRouter manually.
  - Formatting: Task 3.
  - Stale and incomplete runs: Tasks 1, 2 and 4.
- **Placeholder scan:** none. The generated migration filename suffix is chosen by drizzle-kit, so the plan doesn't name it. INSIGHTS `:LINE` is filled in after implementation.
- **Type consistency:**
  - `costUsd` (server) ↔ `cost_usd` (wire) ↔ the client prop `costUsd`.
  - `costOfLatestReviewRun` and `RunCostRow` are identical in Task 2's test and implementation.
  - `RunCostBadge` props and title strings are identical across Tasks 3 and 4.
  - The `RunSummary.cost_usd` fixture is updated in Task 1, where the field becomes required.
- **Review Focus:** all five are mapped to tests.
