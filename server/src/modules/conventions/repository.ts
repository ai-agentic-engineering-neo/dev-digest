import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

export type { ConventionRow, ConventionScanRow };

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`, and
 * writes `conventions.skill_id` once a skill is built out of them.
 *
 * Workspace-scoped throughout. The scan tables are repo-scoped too, but a repo
 * belongs to exactly one workspace, so the workspace guard stays on every read
 * that a request can reach.
 */

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  provider: string;
  model: string;
}

export interface FinishScan {
  status: 'done' | 'failed';
  headSha?: string | null;
  sampleFiles?: string[];
  candidatesTotal?: number;
  candidatesKept?: number;
  discarded?: Record<string, number>;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number | null;
  error?: string | null;
}

export interface InsertCandidate {
  workspaceId: string;
  repoId: string;
  scanId: string;
  rule: string;
  rationale: string | null;
  category: ConventionCategory;
  confidence: number;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  evidenceSha: string | null;
}

export interface UpdateCandidate {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
  confidence?: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  // ---- scans --------------------------------------------------------------

  /**
   * Open a scan. A partial unique index refuses a second `running` row for the
   * same repo, so a double-click loses the race in the database rather than in
   * a check-then-insert the service could not make atomic.
   */
  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        provider: values.provider,
        model: values.model,
        status: 'running',
      })
      .returning();
    return row!;
  }

  async getScan(workspaceId: string, scanId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.id, scanId)),
      );
    return row;
  }

  /** The newest scan of a repo, whatever its status — what the page header reads. */
  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row;
  }

  async runningScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.repoId, repoId), eq(t.conventionScans.status, 'running')),
      );
    return row;
  }

  /**
   * Close every scan of a repo that has been `running` since before `before`.
   *
   * A process restart or a hung model call leaves the row `running` for ever,
   * and the one-running-scan index then refuses every new scan of that repo.
   * Nothing else would ever clear it, so the reads and the scan start do.
   */
  async failStaleScans(repoId: string, before: Date, error: string): Promise<number> {
    const rows = await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', finishedAt: new Date(), error })
      .where(
        and(
          eq(t.conventionScans.repoId, repoId),
          eq(t.conventionScans.status, 'running'),
          lt(t.conventionScans.startedAt, before),
        ),
      )
      .returning({ id: t.conventionScans.id });
    return rows.length;
  }

  async finishScan(scanId: string, values: FinishScan): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({
        status: values.status,
        finishedAt: new Date(),
        ...(values.headSha !== undefined ? { headSha: values.headSha } : {}),
        ...(values.sampleFiles !== undefined ? { sampleFiles: values.sampleFiles } : {}),
        ...(values.candidatesTotal !== undefined ? { candidatesTotal: values.candidatesTotal } : {}),
        ...(values.candidatesKept !== undefined ? { candidatesKept: values.candidatesKept } : {}),
        ...(values.discarded !== undefined ? { discarded: values.discarded } : {}),
        ...(values.tokensIn !== undefined ? { tokensIn: values.tokensIn } : {}),
        ...(values.tokensOut !== undefined ? { tokensOut: values.tokensOut } : {}),
        ...(values.costUsd !== undefined ? { costUsd: values.costUsd } : {}),
        ...(values.error !== undefined ? { error: values.error } : {}),
      })
      .where(eq(t.conventionScans.id, scanId));
  }

  // ---- candidates ---------------------------------------------------------

  /** Every candidate of a repo, newest scan first, best confidence first. */
  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async listByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  /** Rule texts of a repo in a given state — the model's "already decided" list. */
  async rulesByStatus(
    workspaceId: string,
    repoId: string,
    status: ConventionStatus,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, status),
        ),
      );
    return rows.map((r) => r.rule);
  }

  /**
   * Replace the untouched half of a repo's candidates with a fresh batch.
   *
   * One transaction, because the delete alone is destructive: a re-scan that
   * cleared the old `pending` rows and then failed to insert would read as "the
   * scan found nothing" rather than as an error. Accepted and rejected rows are
   * never touched — the user's decisions outlive the model's output.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: InsertCandidate[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          candidates.map((c) => ({
            workspaceId: c.workspaceId,
            repoId: c.repoId,
            scanId: c.scanId,
            rule: c.rule,
            rationale: c.rationale,
            category: c.category,
            status: 'pending' as const,
            confidence: c.confidence,
            evidencePath: c.evidencePath,
            evidenceLineStart: c.evidenceLineStart,
            evidenceLineEnd: c.evidenceLineEnd,
            evidenceSnippet: c.evidenceSnippet,
            evidenceSha: c.evidenceSha,
          })),
        )
        .returning();
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionRow | undefined> {
    const set = {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
    };
    // Every field of the route's body is optional, and Drizzle throws
    // `No values to set` on an empty update — a patch that changes nothing is a
    // read, not a 500.
    if (Object.keys(set).length === 0) return this.getById(workspaceId, id);

    const [row] = await this.db
      .update(t.conventions)
      .set({ ...set, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Stamp the skill these candidates were folded into. */
  async markInSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  /** Repo identity for a scan: full name and clone path, workspace-guarded. */
  async getRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<
    { id: string; owner: string; name: string; fullName: string; defaultBranch: string; clonePath: string | null } | undefined
  > {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** How many candidates each skill absorbed — the Skills screen's provenance. */
  async countsBySkill(skillIds: string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.conventions.skillId, count: sql<number>`count(*)::int` })
      .from(t.conventions)
      .where(inArray(t.conventions.skillId, skillIds))
      .groupBy(t.conventions.skillId);
    return new Map(rows.filter((r) => r.skillId).map((r) => [r.skillId!, Number(r.count)]));
  }
}
