import { eq } from 'drizzle-orm';
import type { Onboarding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `onboarding` table access — the ONLY file in this module that imports
 * `src/db/**` (`db-only-in-repositories`). One row per repo (D5: "one repo,
 * one current tour"); a row exists only for a successful generation
 * (AC-36 — `service.ts` never calls `upsertTour` for a skeleton).
 */

export interface OnboardingTourRow {
  repoId: string;
  json: Onboarding;
  generatedAt: Date;
  indexSha: string;
  indexerVersion: number;
  indexUpdatedAt: Date | null;
  filesIndexed: number;
  filesExcluded: number;
  prsWeighted: number;
  provider: string | null;
  model: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface UpsertOnboardingTourInput {
  repoId: string;
  json: Onboarding;
  indexSha: string;
  indexerVersion: number;
  indexUpdatedAt: Date | null;
  filesIndexed: number;
  filesExcluded: number;
  prsWeighted: number;
  provider: string | null;
  model: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async getTour(repoId: string): Promise<OnboardingTourRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    if (!row) return undefined;
    return {
      repoId: row.repoId,
      json: row.json as Onboarding,
      generatedAt: row.generatedAt,
      indexSha: row.indexSha,
      indexerVersion: row.indexerVersion,
      indexUpdatedAt: row.indexUpdatedAt,
      filesIndexed: row.filesIndexed,
      filesExcluded: row.filesExcluded,
      prsWeighted: row.prsWeighted,
      provider: row.provider,
      model: row.model,
      attempts: row.attempts,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
    };
  }

  /** Insert-or-replace the repo's ONE current tour (PK = repoId). */
  async upsertTour(input: UpsertOnboardingTourInput): Promise<void> {
    const generatedAt = new Date();
    const values = {
      repoId: input.repoId,
      json: input.json,
      generatedAt,
      indexSha: input.indexSha,
      indexerVersion: input.indexerVersion,
      indexUpdatedAt: input.indexUpdatedAt,
      filesIndexed: input.filesIndexed,
      filesExcluded: input.filesExcluded,
      prsWeighted: input.prsWeighted,
      provider: input.provider,
      model: input.model,
      attempts: input.attempts,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd,
    };
    await this.db
      .insert(t.onboarding)
      .values(values)
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
  }
}
