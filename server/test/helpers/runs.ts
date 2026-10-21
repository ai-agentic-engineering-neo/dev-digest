import * as t from '../../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 *
 * A run row turns terminal (`completeAgentRun`) BEFORE its `run_traces` row is
 * written, so the wait also requires the trace of every terminal run. It throws
 * on timeout instead of returning unfinished rows.
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/** Under vitest's 120s per-test timeout (vitest.config.ts), so a stuck run fails here with a clear message. */
const DEFAULT_TIMEOUT_MS = 60_000;

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    const traced = new Set(
      terminal.length
        ? (
            await db
              .select({ runId: t.runTraces.runId })
              .from(t.runTraces)
              .where(
                inArray(
                  t.runTraces.runId,
                  terminal.map((r) => r.id),
                ),
              )
          ).map((r) => r.runId)
        : [],
    );
    const settled = terminal.filter((r) => traced.has(r.id));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? settled.length >= expected
        : runs.length > 0 && settled.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForPrRuns timed out after ${timeoutMs}ms for PR ${prId} (expected ${expected ?? 'all'}): ` +
          `${runs.length} run(s) [${runs.map((r) => r.status).join(', ')}], ` +
          `${terminal.length} terminal, ${settled.length} with a trace`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
