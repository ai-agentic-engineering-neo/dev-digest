import { and, asc, desc, eq, ne } from 'drizzle-orm';
import {
  FeatureModelChoice,
  type ConventionCandidate,
  type ConventionStatus,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { GroundedConvention } from './domain.js';
import type { ConventionPatch, ConventionsRepoRef, ConventionsRepositoryPort } from './ports.js';

/**
 * Conventions data-access. Owns `conventions`; reads `repos` (workspace check
 * + clone info) and `settings` (feature-model override). Workspace-scoped
 * throughout — there is no automatic tenancy guard.
 */

type ConventionRow = typeof t.conventions.$inferSelect;

function toCandidate(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category ?? null,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    line_start: row.lineStart ?? null,
    line_end: row.lineEnd ?? null,
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

export class ConventionsRepository implements ConventionsRepositoryPort {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ConventionsRepoRef | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!row) return undefined;
    return { id: row.id, owner: row.owner, name: row.name, fullName: row.fullName, cloned: !!row.clonePath };
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt));
    return rows.map(toCandidate);
  }

  async acceptedRules(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
    return rows.map((r) => r.rule);
  }

  async replaceUnaccepted(workspaceId: string, repoId: string, items: GroundedConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            ne(t.conventions.status, 'accepted'),
          ),
        );
      if (items.length === 0) return;
      await tx.insert(t.conventions).values(
        items.map((c) => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceSnippet: c.evidenceSnippet,
          lineStart: c.lineStart,
          lineEnd: c.lineEnd,
          confidence: c.confidence,
          status: 'pending' as const,
        })),
      );
    });
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toCandidate(row) : undefined;
  }

  async setAllStatus(workspaceId: string, repoId: string, status: ConventionStatus): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async featureModelOverride(workspaceId: string) {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    const fm = row?.value as Record<string, unknown> | undefined;
    const parsed = FeatureModelChoice.safeParse(fm?.conventions);
    return parsed.success ? parsed.data : undefined;
  }
}
