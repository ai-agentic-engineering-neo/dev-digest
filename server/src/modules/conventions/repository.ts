/**
 * conventions — Drizzle repository (ring 3a). Owns `convention_scans` and
 * `conventions`; maps rows to the shared DTOs; scopes by workspace.
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { ConventionCandidate, ConventionCategory, ConventionScan, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ruleKey } from './helpers.js';
import type { CandidatePatch, ConventionsRepositoryPort, NewCandidate } from './ports.js';

type ScanRow = typeof t.conventionScans.$inferSelect;
type CandidateRow = typeof t.conventions.$inferSelect;

const toScan = (r: ScanRow): ConventionScan => ({
  id: r.id,
  repo_id: r.repoId,
  status: r.status,
  provider: r.provider,
  model: r.model,
  sample_count: r.sampleCount,
  candidates_found: r.candidatesFound,
  candidates_kept: r.candidatesKept,
  error: r.error,
  started_at: r.startedAt.toISOString(),
  finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
});

const toCandidate = (r: CandidateRow): ConventionCandidate => ({
  id: r.id,
  repo_id: r.repoId ?? '',
  scan_id: r.scanId,
  category: r.category as ConventionCategory,
  rule: r.rule,
  evidence_path: r.evidencePath ?? '',
  evidence_line: r.evidenceLine ?? 0,
  evidence_snippet: r.evidenceSnippet ?? '',
  confidence: r.confidence ?? 0,
  status: r.status as ConventionStatus,
  updated_at: r.updatedAt.toISOString(),
});

export class ConventionsRepository implements ConventionsRepositoryPort {
  constructor(private readonly db: Db) {}

  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScan | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row ? toScan(row) : undefined;
  }

  async createScan(workspaceId: string, repoId: string, model: { provider: string; model: string }): Promise<ConventionScan> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, provider: model.provider, model: model.model, status: 'running' })
      .returning();
    return toScan(row!);
  }

  async finishScan(
    workspaceId: string,
    scanId: string,
    result: { status: 'done' | 'failed'; sampleCount: number; candidatesFound: number; candidatesKept: number; error?: string },
  ): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({
        status: result.status,
        sampleCount: result.sampleCount,
        candidatesFound: result.candidatesFound,
        candidatesKept: result.candidatesKept,
        error: result.error ?? null,
        finishedAt: new Date(),
      })
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.id, scanId)));
  }

  async listCandidates(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), t.conventions.rule);
    return rows.map(toCandidate);
  }

  async replaceCandidates(workspaceId: string, repoId: string, scanId: string, rows: NewCandidate[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rejected = await tx
        .select({ id: t.conventions.id, rule: t.conventions.rule })
        .from(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'rejected')));
      const rejectedKeys = new Set(rejected.map((r) => ruleKey(r.rule)));
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), ne(t.conventions.status, 'rejected')));
      const fresh = rows.filter((r) => !rejectedKeys.has(ruleKey(r.rule)));
      if (fresh.length > 0) {
        await tx.insert(t.conventions).values(
          fresh.map((r) => ({
            workspaceId,
            repoId,
            scanId,
            category: r.category,
            rule: r.rule,
            evidencePath: r.evidencePath,
            evidenceLine: r.evidenceLine,
            evidenceSnippet: r.evidenceSnippet,
            confidence: r.confidence,
            status: 'candidate' as const,
            accepted: false,
          })),
        );
      }
      return fresh.length;
    });
  }

  async updateCandidate(workspaceId: string, id: string, patch: CandidatePatch): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status, accepted: patch.status === 'accepted' } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toCandidate(row) : undefined;
  }

  async deselectAll(workspaceId: string, repoId: string): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ status: 'candidate', accepted: false, updatedAt: sql`now()` })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'accepted')))
      .returning({ id: t.conventions.id });
    return rows.length;
  }
}
