import { and, desc, eq, inArray, isNull, not, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ConventionCategory, ConventionEvidence, ConventionScan } from '@devdigest/shared';
import type { Db, DbExecutor, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionDetails,
  ConventionPatch,
  ConventionRecord,
  RepoRefRecord,
  VerifiedRule,
} from './helpers.js';
import type { ConventionsTx, ConventionsUnitOfWork, SkillWriter } from './ports.js';

/**
 * Conventions data access. Owns `conventions`; reads `repos` (clone ref) and
 * `skills` (names for the "in skill" badge). Every method is workspace-scoped.
 * Rows and the raw `details` jsonb never leave this file: they are parsed here
 * (a row written by older code has no details) and mapped to contract types.
 */

type Row = typeof t.conventions.$inferSelect;

/** Boundary parse of `conventions.details` — tolerant: bad parts are dropped, not thrown. */
const DetailsSchema = z.object({
  category: ConventionCategory.optional().catch(undefined),
  bad_example: z.string().nullish().catch(null),
  evidence: z.array(ConventionEvidence).catch([]),
  scan: ConventionScan.optional().catch(undefined),
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
  /** On a transaction handle every method joins it (own transactions become savepoints). */
  constructor(private readonly db: DbExecutor) {}

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
    scan: ConventionScan,
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

  /**
   * Read-modify-write under a row lock: `makePatch` sees the row as it is NOW,
   * so a concurrent `markInSkill` (or another edit) is never lost. Errors thrown
   * by `makePatch` roll the transaction back.
   */
  async update(
    workspaceId: string,
    id: string,
    makePatch: (current: ConventionRecord) => ConventionPatch,
  ): Promise<ConventionRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
        .for('update');
      if (!locked) return undefined;
      const patch = makePatch(toRecord(locked));
      const [row] = await tx
        .update(t.conventions)
        .set({
          ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
          ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
          ...(patch.rejectedAt !== undefined ? { rejectedAt: patch.rejectedAt } : {}),
          ...(patch.details !== undefined ? detailColumns(patch.details) : {}),
        })
        .where(eq(t.conventions.id, id))
        .returning();
      return row ? toRecord(row) : undefined;
    });
  }

  /**
   * Append `skillId` to `details.skill_ids` in ONE statement (jsonb in SQL, no
   * read-modify-write); rows that already hold it are skipped. A legacy row
   * without details gets `{ skill_ids: [id] }` (its evidence stays in the flat
   * columns, which the reader falls back to).
   */
  async markInSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    const current = sql`coalesce(${t.conventions.details} -> 'skill_ids', '[]'::jsonb)`;
    const idJson = sql`jsonb_build_array(${skillId}::text)`;
    await this.db
      .update(t.conventions)
      .set({
        details: sql`jsonb_set(coalesce(${t.conventions.details}, '{}'::jsonb), '{skill_ids}', ${current} || ${idJson})`,
      })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          inArray(t.conventions.id, ids),
          not(sql`${current} @> ${idJson}`),
        ),
      );
  }
}

/**
 * The conventions UnitOfWork: one `db.transaction`, with the conventions store
 * and the skills writer both bound to it. `skillsOn` comes from the composition
 * root (the skills repository belongs to another module).
 */
export class DrizzleConventionsUnitOfWork implements ConventionsUnitOfWork {
  constructor(
    private readonly db: Db,
    private readonly skillsOn: (tx: DbTx) => SkillWriter,
  ) {}

  run<T>(work: (tx: ConventionsTx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ conventions: new ConventionsRepository(tx), skills: this.skillsOn(tx) }),
    );
  }
}
