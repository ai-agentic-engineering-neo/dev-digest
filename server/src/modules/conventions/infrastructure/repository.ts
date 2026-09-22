/**
 * Conventions data access (infrastructure; implements ConventionsStore + RepoLookup).
 * Owns `conventions` and `convention_scans`; reads `repos` for the workspace check.
 */
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Convention, ConventionScan } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { ConflictError } from '../../../platform/errors.js';
import type { ConventionPatch, ConventionsStore, RepoLookup, RepoRef } from '../application/ports.js';
import type { KeptConvention, ScanSummary } from '../domain/types.js';
import { toConventionDto, toConventionScanDto } from './mappers.js';

/** pg SQLSTATE of a driver error (Drizzle wraps it: the code is on `cause`). */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/** accepted → pending → rejected. */
const STATUS_ORDER = sql`case ${t.conventions.status} when 'accepted' then 0 when 'pending' then 1 else 2 end`;

export class ConventionsRepository implements ConventionsStore, RepoLookup {
  constructor(private readonly db: Db) {}

  // ---- RepoLookup -------------------------------------------------------------

  async get(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName, name: t.repos.name, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  // ---- reads ------------------------------------------------------------------

  async latestScan(repoId: string): Promise<ConventionScan | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row && toConventionScanDto(row);
  }

  async list(repoId: string): Promise<Convention[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId))
      .orderBy(STATUS_ORDER, sql`${t.conventions.confidence} desc nulls last`, asc(t.conventions.createdAt));
    return rows.map(toConventionDto);
  }

  async find(workspaceId: string, id: string): Promise<Convention | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row && toConventionDto(row);
  }

  // ---- scans ------------------------------------------------------------------

  async failStaleScans(repoId: string, before: Date): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error: 'The scan was interrupted', finishedAt: new Date() })
      .where(
        and(
          eq(t.conventionScans.repoId, repoId),
          eq(t.conventionScans.status, 'running'),
          lt(t.conventionScans.startedAt, before),
        ),
      );
  }

  async startScan(workspaceId: string, repoId: string): Promise<ConventionScan> {
    try {
      const [row] = await this.db.insert(t.conventionScans).values({ workspaceId, repoId }).returning();
      return toConventionScanDto(row!);
    } catch (err) {
      if (pgCode(err) === '23505') {
        throw new ConflictError('A conventions scan is already running for this repo', undefined, 'scan_running');
      }
      throw err;
    }
  }

  async failScan(scanId: string, error: string, summary: Partial<ScanSummary> = {}): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error, finishedAt: new Date(), ...scanColumns(summary) })
      .where(eq(t.conventionScans.id, scanId));
  }

  async completeScan(
    scan: { id: string; workspaceId: string; repoId: string },
    kept: KeptConvention[],
    summary: ScanSummary,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.repoId, scan.repoId),
            eq(t.conventions.status, 'pending'),
            eq(t.conventions.edited, false),
          ),
        );
      if (kept.length > 0) {
        await tx.insert(t.conventions).values(
          kept.map((k) => ({
            workspaceId: scan.workspaceId,
            repoId: scan.repoId,
            scanId: scan.id,
            category: k.category,
            rule: k.rule,
            evidence: k.evidence,
            confidence: k.confidence,
          })),
        );
      }
      await tx
        .update(t.conventionScans)
        .set({ status: 'done', finishedAt: new Date(), ...scanColumns(summary) })
        .where(eq(t.conventionScans.id, scan.id));
    });
  }

  // ---- rules ------------------------------------------------------------------

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<Convention | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row && toConventionDto(row);
  }

  async setSkill(repoId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId, updatedAt: new Date() })
      .where(and(eq(t.conventions.repoId, repoId), inArray(t.conventions.id, ids)));
  }
}

function scanColumns(s: Partial<ScanSummary>) {
  return {
    ...(s.sampledFiles !== undefined ? { sampledFiles: s.sampledFiles } : {}),
    ...(s.proposed !== undefined ? { proposed: s.proposed } : {}),
    ...(s.kept !== undefined ? { kept: s.kept } : {}),
    ...(s.dropped !== undefined ? { dropped: s.dropped } : {}),
    ...(s.model !== undefined ? { model: s.model } : {}),
    ...(s.tokensIn !== undefined ? { tokensIn: s.tokensIn } : {}),
    ...(s.tokensOut !== undefined ? { tokensOut: s.tokensOut } : {}),
    ...(s.costUsd !== undefined ? { costUsd: s.costUsd } : {}),
  };
}
