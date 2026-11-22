import 'dotenv/config';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { Container } from '../platform/container.js';
import { loadConfig } from '../platform/config.js';
import type { RunTrace } from '@devdigest/shared';

/** USD per 1M tokens, or null when the model has no known price. */
export type PriceLookup = (model: string) => { in: number; out: number } | null;

export interface BackfillReport {
  /** Runs that got an estimated cost. */
  updated: number;
  /** Total estimated USD written. */
  totalUsd: number;
  /** Models skipped because no price was found → their runs stay "—". */
  skippedModels: Record<string, number>;
}

/**
 * M1 addendum — give runs created before cost tracking an APPROXIMATE cost:
 * tokens_in × input price + tokens_out × output price, flagged
 * `cost_estimated = true`. Only `done` runs that have tokens and no cost yet,
 * so re-running is a no-op. The run's trace document gets the same values so
 * the Run trace drawer agrees with the timeline.
 */
export async function backfillEstimatedCosts(db: Db, price: PriceLookup): Promise<BackfillReport> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      model: t.agentRuns.model,
      tokensIn: t.agentRuns.tokensIn,
      tokensOut: t.agentRuns.tokensOut,
    })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.status, 'done'),
        isNull(t.agentRuns.costUsd),
        gt(sql`coalesce(${t.agentRuns.tokensIn}, 0) + coalesce(${t.agentRuns.tokensOut}, 0)`, 0),
      ),
    );

  const report: BackfillReport = { updated: 0, totalUsd: 0, skippedModels: {} };
  for (const r of rows) {
    const p = r.model ? price(r.model) : null;
    if (!p) {
      const key = r.model ?? '(no model)';
      report.skippedModels[key] = (report.skippedModels[key] ?? 0) + 1;
      continue;
    }
    const cost = ((r.tokensIn ?? 0) * p.in + (r.tokensOut ?? 0) * p.out) / 1_000_000;

    await db.transaction(async (tx) => {
      // isNull guard keeps a concurrent real run from being overwritten.
      await tx
        .update(t.agentRuns)
        .set({ costUsd: cost, costEstimated: true })
        .where(and(eq(t.agentRuns.id, r.id), isNull(t.agentRuns.costUsd)));
      const [doc] = await tx
        .select({ trace: t.runTraces.trace })
        .from(t.runTraces)
        .where(eq(t.runTraces.runId, r.id));
      if (doc) {
        const trace = doc.trace as RunTrace;
        await tx
          .update(t.runTraces)
          .set({ trace: { ...trace, stats: { ...trace.stats, cost_usd: cost, cost_estimated: true } } })
          .where(eq(t.runTraces.runId, r.id));
      }
    });
    report.updated += 1;
    report.totalUsd += cost;
  }
  return report;
}

// CLI entrypoint: `pnpm db:backfill-costs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  const container = new Container(loadConfig(), handle.db);
  // Live OpenRouter list prices only (user decision): no static-table fallback.
  container.priceBook
    .refresh()
    .then(() => backfillEstimatedCosts(handle.db, (m) => container.priceBook.livePrice(m)))
    .then(async (r) => {
      console.log(
        `✓ backfilled ${r.updated} run(s), ~$${r.totalUsd.toFixed(6)} estimated` +
          (Object.keys(r.skippedModels).length
            ? `; skipped (no live price): ${JSON.stringify(r.skippedModels)}`
            : ''),
      );
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ backfill failed:', err);
      await handle.close();
      process.exit(1);
    });
}
