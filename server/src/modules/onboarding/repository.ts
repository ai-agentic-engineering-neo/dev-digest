/**
 * onboarding — Drizzle repository (ring 3a). Owns `onboarding` and
 * `onboarding_runs`; maps rows to the shared DTOs. `onboarding` has no
 * `workspace_id`, so its reads and writes are scoped through `repos`.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { Onboarding, type OnboardingRun } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingRepositoryPort, RunUsage } from './ports.js';

type RunRow = typeof t.onboardingRuns.$inferSelect;

export const toRun = (r: RunRow): OnboardingRun => ({
  id: r.id,
  repo_id: r.repoId,
  status: r.status,
  provider: r.provider,
  model: r.model,
  tokens_in: r.tokensIn,
  tokens_out: r.tokensOut,
  cost_usd: r.costUsd,
  files_indexed: r.filesIndexed,
  error: r.error,
  started_at: r.startedAt.toISOString(),
  finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
});

export class OnboardingRepository implements OnboardingRepositoryPort {
  constructor(private readonly db: Db) {}

  async getStored(workspaceId: string, repoId: string): Promise<Onboarding | null> {
    const [row] = await this.db
      .select({ o: t.onboarding })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    if (!row) return null;
    const o = row.o;
    const json = (o.json ?? {}) as { sections?: unknown };
    const parsed = Onboarding.safeParse({
      generated_at: o.generatedAt.toISOString(),
      provider: o.provider,
      model: o.model,
      tokens_in: o.tokensIn ?? 0,
      tokens_out: o.tokensOut ?? 0,
      cost_usd: o.costUsd,
      files_indexed: o.filesIndexed ?? 0,
      limited: o.limited,
      sections: json.sections,
    });
    return parsed.success ? parsed.data : null;
  }

  async getLatestRun(workspaceId: string, repoId: string): Promise<OnboardingRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.onboardingRuns)
      .where(and(eq(t.onboardingRuns.workspaceId, workspaceId), eq(t.onboardingRuns.repoId, repoId)))
      .orderBy(desc(t.onboardingRuns.startedAt))
      .limit(1);
    return row ? toRun(row) : undefined;
  }

  async createRun(workspaceId: string, repoId: string, model: { provider: string; model: string }): Promise<OnboardingRun> {
    const [row] = await this.db
      .insert(t.onboardingRuns)
      .values({ workspaceId, repoId, provider: model.provider, model: model.model, status: 'running' })
      .returning();
    return toRun(row!);
  }

  async failRun(workspaceId: string, runId: string, error: string, usage: RunUsage = {}): Promise<void> {
    await this.db
      .update(t.onboardingRuns)
      .set({
        status: 'failed',
        error,
        finishedAt: new Date(),
        ...(usage.tokensIn !== undefined ? { tokensIn: usage.tokensIn } : {}),
        ...(usage.tokensOut !== undefined ? { tokensOut: usage.tokensOut } : {}),
        ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
        ...(usage.filesIndexed !== undefined ? { filesIndexed: usage.filesIndexed } : {}),
      })
      .where(and(eq(t.onboardingRuns.workspaceId, workspaceId), eq(t.onboardingRuns.id, runId)));
  }

  async completeRun(workspaceId: string, repoId: string, runId: string, tour: Onboarding): Promise<void> {
    await this.db.transaction(async (tx) => {
      const values = {
        json: { sections: tour.sections },
        generatedAt: new Date(tour.generated_at),
        runId,
        provider: tour.provider,
        model: tour.model,
        tokensIn: tour.tokens_in,
        tokensOut: tour.tokens_out,
        costUsd: tour.cost_usd,
        filesIndexed: tour.files_indexed,
        limited: tour.limited,
      };
      await tx
        .insert(t.onboarding)
        .values({ repoId, ...values })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
      await tx
        .update(t.onboardingRuns)
        .set({
          status: 'done',
          error: null,
          finishedAt: sql`now()`,
          tokensIn: tour.tokens_in,
          tokensOut: tour.tokens_out,
          costUsd: tour.cost_usd,
          filesIndexed: tour.files_indexed,
        })
        .where(and(eq(t.onboardingRuns.workspaceId, workspaceId), eq(t.onboardingRuns.id, runId)));
    });
  }
}
