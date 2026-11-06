import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { FeatureModelChoice } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import {
  INTENT_CONFIDENCES,
  INTENT_CONFIDENCE_REASONS,
  INTENT_DERIVATION_STATUSES,
  INTENT_KINDS,
  type IntentRecord,
} from './domain/types.js';
import type {
  DerivedIntentWrite,
  IntentChangedFile,
  IntentFailureWrite,
  IntentOverrideWrite,
  IntentPullContext,
  IntentRepositoryPort,
} from './ports.js';
import { parseIntentSources } from './schemas.js';

type IntentRow = typeof t.prIntent.$inferSelect;

function pick<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function toRecord(row: IntentRow): IntentRecord {
  const status = pick(INTENT_DERIVATION_STATUSES, row.status, 'failed');
  const sources = parseIntentSources(row.sources);
  return {
    prId: row.prId,
    status,
    derived:
      status === 'ok' && row.intent !== null
        ? { intent: row.intent, inScope: row.inScope, outOfScope: row.outOfScope }
        : null,
    kind: pick(INTENT_KINDS, row.kind, 'unknown'),
    confidence: pick(INTENT_CONFIDENCES, row.confidence, 'low'),
    confidenceReason: pick(INTENT_CONFIDENCE_REASONS, row.confidenceReason, 'indirect_only'),
    confidenceLowered: row.confidenceLowered,
    sources,
    headSha: row.headSha,
    inputHash: row.inputHash,
    bodyHash: row.bodyHash,
    usage:
      row.provider !== null && row.model !== null
        ? {
            provider: row.provider,
            model: row.model,
            tokensIn: row.tokensIn ?? 0,
            tokensOut: row.tokensOut ?? 0,
            costUsd: row.costUsd,
          }
        : null,
    error: row.error,
    override:
      row.overrideIntent !== null
        ? {
            intent: row.overrideIntent,
            inScope: row.overrideInScope ?? [],
            outOfScope: row.overrideOutOfScope ?? [],
            headSha: row.overrideHeadSha ?? '',
            at: row.overriddenAt ?? row.updatedAt,
          }
        : null,
    updatedAt: row.updatedAt,
  };
}

/**
 * Intent data-access. Owns `pr_intent`; reads `pull_requests`, `repos`, `pr_commits`,
 * `pr_files`, `settings`. `pr_intent` has no workspace_id: callers must go through
 * `getPullContext` (workspace-filtered) before using a prId.
 */
export class IntentRepository implements IntentRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<IntentPullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(
        and(
          eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
        ),
      );
    if (!row) return undefined;
    const { clonePath, ...rest } = row;
    return { ...rest, cloned: !!clonePath };
  }

  async listCommitMessages(prId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(sql`${t.prCommits.committedAt} asc nulls first`, asc(t.prCommits.id))
      .limit(limit);
    return rows.map((r) => r.message);
  }

  async listChangedFiles(prId: string): Promise<IntentChangedFile[]> {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  async knownPullNumbers(repoId: string, numbers: readonly number[]): Promise<Set<number>> {
    if (numbers.length === 0) return new Set();
    const rows = await this.db
      .select({ number: t.pullRequests.number })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), inArray(t.pullRequests.number, [...numbers])));
    return new Set(rows.map((r) => r.number));
  }

  async get(prId: string): Promise<IntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toRecord(row) : undefined;
  }

  async saveDerived(prId: string, w: DerivedIntentWrite): Promise<IntentRecord> {
    const values = {
      intent: w.derived.intent,
      inScope: w.derived.inScope,
      outOfScope: w.derived.outOfScope,
      kind: w.kind,
      confidence: w.confidence,
      confidenceReason: w.confidenceReason,
      confidenceLowered: w.confidenceLowered,
      sources: w.sources,
      status: 'ok',
      error: null,
      headSha: w.headSha,
      inputHash: w.inputHash,
      bodyHash: w.bodyHash,
      provider: w.usage.provider,
      model: w.usage.model,
      tokensIn: w.usage.tokensIn,
      tokensOut: w.usage.tokensOut,
      costUsd: w.usage.costUsd,
      updatedAt: new Date(),
    };
    // `set` deliberately never names override_* columns.
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    if (!row) throw new Error('pr_intent upsert returned no row');
    return toRecord(row);
  }

  async saveFailure(prId: string, w: IntentFailureWrite): Promise<IntentRecord> {
    const values = {
      intent: null,
      inScope: [] as string[],
      outOfScope: [] as string[],
      sources: w.sources,
      status: 'failed',
      error: w.error,
      headSha: w.headSha,
      inputHash: w.inputHash,
      bodyHash: w.bodyHash,
      provider: w.usage?.provider ?? null,
      model: w.usage?.model ?? null,
      tokensIn: w.usage?.tokensIn ?? null,
      tokensOut: w.usage?.tokensOut ?? null,
      costUsd: w.usage?.costUsd ?? null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: values,
        setWhere: ne(t.prIntent.status, 'ok'),
      })
      .returning();
    if (row) return toRecord(row);
    // An ok row exists: the WHERE blocked the update. Return it unchanged.
    const existing = await this.get(prId);
    if (!existing) throw new Error('pr_intent failure upsert returned no row');
    return existing;
  }

  async setOverride(prId: string, w: IntentOverrideWrite): Promise<IntentRecord> {
    const now = new Date();
    const override = {
      overrideIntent: w.intent,
      overrideInScope: w.inScope,
      overrideOutOfScope: w.outOfScope,
      overrideHeadSha: w.headSha,
      overriddenAt: now,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, status: 'none', ...override })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: override })
      .returning();
    if (!row) throw new Error('pr_intent override upsert returned no row');
    return toRecord(row);
  }

  async clearOverride(prId: string): Promise<IntentRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.prIntent)
        .set({
          overrideIntent: null,
          overrideInScope: null,
          overrideOutOfScope: null,
          overrideHeadSha: null,
          overriddenAt: null,
          updatedAt: new Date(),
        })
        .where(eq(t.prIntent.prId, prId))
        .returning();
      if (!row) return undefined;
      if (row.status === 'none') {
        await tx.delete(t.prIntent).where(eq(t.prIntent.prId, prId));
        return undefined;
      }
      return toRecord(row);
    });
  }

  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    const value: unknown = row?.value;
    const choices = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
    const parsed = FeatureModelChoice.safeParse(choices?.review_intent);
    return parsed.success ? parsed.data : undefined;
  }
}
