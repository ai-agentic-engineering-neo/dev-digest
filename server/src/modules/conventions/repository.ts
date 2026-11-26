import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { ConventionCategory, ConventionEvidence } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionDetails,
  ConventionPatch,
  ConventionRecord,
  ConventionScanMeta,
  RepoRefRecord,
  VerifiedRule,
} from './helpers.js';

/**
 * Conventions data access. Owns `conventions`; reads `repos` (clone ref) and
 * `skills` (names for the "in skill" badge). Every method is workspace-scoped.
 * Rows and the raw `details` jsonb never leave this file: they are parsed here
 * (a row written by older code has no details) and mapped to contract types.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Row = typeof t.conventions.$inferSelect;

/** Boundary parse of `conventions.details` — tolerant: bad parts are dropped, not thrown. */
const DetailsSchema = z.object({
  category: ConventionCategory.optional().catch(undefined),
  bad_example: z.string().nullish().catch(null),
  evidence: z.array(ConventionEvidence).catch([]),
  scan: z
    .object({
      at: z.string(),
      commit_sha: z.string().nullable(),
      files_sampled: z.number().int(),
      model: z.string(),
    })
    .optional()
    .catch(undefined),
  skill_ids: z.array(z.string()).optional().catch(undefined),
});

function parseDetails(raw: unknown): ConventionDetails {
  const parsed = DetailsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { evidence: [] };
}

function toRecord(row: Row): ConventionRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    rule: row.rule,
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
    rejectedAt: row.rejectedAt,
    evidencePath: row.evidencePath,
    evidenceSnippet: row.evidenceSnippet,
    details: parseDetails(row.details),
  };
}

/**
 * Columns for a details value: evidence_path/snippet mirror evidence[0]. With
 * no evidence (a legacy row edited before it had `details`) the flat columns
 * are left alone — they are that row's only evidence.
 */
function detailColumns(details: ConventionDetails) {
  const first = details.evidence[0];
  return first ? { details, evidencePath: first.path, evidenceSnippet: first.snippet } : { details };
}

export class ConventionsRepository {
  constructor(private readonly db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRefRecord | undefined> {
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

  /** All conventions of a repo, highest confidence first. */
  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), t.conventions.id);
    return rows.map(toRecord);
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row ? toRecord(row) : undefined;
  }

  /** The given ids that belong to this workspace + repo (others are silently absent). */
  async getMany(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      )
      .orderBy(desc(t.conventions.confidence), t.conventions.id);
    return rows.map(toRecord);
  }

  /** id → name for the workspace's skills among `ids`. */
  async skillNames(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * A re-scan: in ONE transaction, delete the repo's PENDING rows and insert
   * the new ones. Accepted and rejected rows are never touched, so a decision
   * is never re-litigated.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    rules: VerifiedRule[],
    scan: ConventionScanMeta,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.accepted, false),
            isNull(t.conventions.rejectedAt),
          ),
        );
      if (rules.length === 0) return;
      await tx.insert(t.conventions).values(
        rules.map((r) => ({
          workspaceId,
          repoId,
          rule: r.rule,
          confidence: r.confidence,
          accepted: false,
          ...detailColumns({
            category: r.category,
            bad_example: r.bad_example,
            evidence: r.evidence,
            scan,
          }),
        })),
      );
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
        ...(patch.rejectedAt !== undefined ? { rejectedAt: patch.rejectedAt } : {}),
        ...(patch.details !== undefined ? detailColumns(patch.details) : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toRecord(row) : undefined;
  }

  /** Record that these conventions went into `skillId` (details.skill_ids), atomically. */
  async markInSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.transaction(async (tx: Tx) => {
      const rows = await tx
        .select()
        .from(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)))
        .for('update');
      for (const row of rows) {
        const details = parseDetails(row.details);
        const skillIds = new Set(details.skill_ids ?? []);
        if (skillIds.has(skillId)) continue;
        skillIds.add(skillId);
        await tx
          .update(t.conventions)
          .set({ details: { ...details, skill_ids: [...skillIds] } })
          .where(eq(t.conventions.id, row.id));
      }
    });
  }
}
