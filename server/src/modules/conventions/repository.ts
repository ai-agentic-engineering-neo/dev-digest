import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Provider } from '@devdigest/shared';
import { normalizeRule } from './helpers.js';

/**
 * Conventions data-access. Owns `convention_scans` and `conventions`. Every
 * read/write is workspace-scoped (C9). The C6 re-scan replace is one
 * transaction, copying the shape of `AgentsRepository.setSkills` — the
 * codebase's first `db.transaction()` template (server/INSIGHTS.md).
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;
export type RepoBasicsRow = Pick<
  typeof t.repos.$inferSelect,
  'id' | 'owner' | 'name' | 'fullName' | 'clonePath'
>;

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  sha: string;
  model: string;
  provider: Provider;
  status: 'ok' | 'failed';
  sampleFiles: string[];
  candidatesFound: number;
  candidatesDropped: number;
  error?: string;
}

export interface NewCandidate {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface UpdateCandidate {
  status?: 'pending' | 'accepted' | 'rejected';
  rule?: string;
  category?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped repo lookup — the only fields this module needs. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoBasicsRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** All non-rejected candidates for a repo, in the order they were created (C7's "list order"). */
  async listNonRejected(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(asc(t.conventions.createdAt));
  }

  async getAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(asc(t.conventions.createdAt));
  }

  async getCandidate(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** A failed extraction (C10): record the scan, touch nothing in `conventions`. */
  async insertFailedScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db.insert(t.conventionScans).values(toScanInsert(values)).returning();
    return row!;
  }

  /**
   * C6 — one transaction: insert the new scan row, delete `pending`
   * candidates for the repo, then insert the newly verified ones, EXCEPT any
   * whose `normalizeRule` matches an existing accepted-or-rejected rule for
   * this repo. Every statement uses `tx`, never `this.db` (server/INSIGHTS.md).
   */
  async runScan(scanValues: InsertScan, newCandidates: NewCandidate[]): Promise<ConventionScanRow> {
    return this.db.transaction(async (tx) => {
      const [scan] = await tx.insert(t.conventionScans).values(toScanInsert(scanValues)).returning();

      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, scanValues.workspaceId),
            eq(t.conventions.repoId, scanValues.repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );

      const settled = await tx
        .select({ rule: t.conventions.rule })
        .from(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, scanValues.workspaceId),
            eq(t.conventions.repoId, scanValues.repoId),
            inArray(t.conventions.status, ['accepted', 'rejected']),
          ),
        );
      const settledNormalized = new Set(settled.map((r) => normalizeRule(r.rule)));

      const toInsert = newCandidates.filter((c) => !settledNormalized.has(normalizeRule(c.rule)));
      if (toInsert.length > 0) {
        await tx.insert(t.conventions).values(
          toInsert.map((c) => ({
            workspaceId: scanValues.workspaceId,
            repoId: scanValues.repoId,
            scanId: scan!.id,
            category: c.category,
            rule: c.rule,
            evidencePath: c.evidencePath,
            evidenceStartLine: c.evidenceStartLine,
            evidenceEndLine: c.evidenceEndLine,
            evidenceSnippet: c.evidenceSnippet,
            confidence: c.confidence,
            status: 'pending' as const,
          })),
        );
      }

      return scan!;
    });
  }
}

function toScanInsert(values: InsertScan) {
  return {
    workspaceId: values.workspaceId,
    repoId: values.repoId,
    sha: values.sha,
    model: values.model,
    provider: values.provider,
    status: values.status,
    sampleFiles: values.sampleFiles,
    candidatesFound: values.candidatesFound,
    candidatesDropped: values.candidatesDropped,
    error: values.error ?? null,
  };
}
