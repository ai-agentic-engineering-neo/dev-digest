/**
 * skills — Drizzle repository (ring 3a).
 *
 * The only file in the module that knows the table. Implements
 * `SkillsRepositoryPort`, maps rows to DTOs before they leave, scopes every
 * query by `workspaceId`, and owns the transaction for the versioned writes.
 */
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ConflictError } from '../../platform/errors.js';

/** Postgres unique_violation on `skills_ws_name_uidx` (a concurrent create won the race). */
const isNameClash = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505' &&
  String((err as { constraint_name?: string }).constraint_name ?? '').includes('skills_ws_name');
import { INITIAL_SKILL_VERSION } from './constants.js';
import type {
  CreateSkillInput,
  SkillDto,
  SkillVersionDto,
  SkillsRepositoryPort,
  UpdateSkillInput,
} from './ports.js';

type SkillRow = typeof t.skills.$inferSelect;
type SkillVersionRow = typeof t.skillVersions.$inferSelect;

const toDto = (row: SkillRow, agentCount = 0): SkillDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  type: row.type,
  source: row.source,
  body: row.body,
  enabled: row.enabled,
  version: row.version,
  evidence_files: row.evidenceFiles ?? null,
  agent_count: agentCount,
});

const toVersionDto = (row: SkillVersionRow): SkillVersionDto => ({
  skill_id: row.skillId,
  version: row.version,
  body: row.body,
  created_at: row.createdAt.toISOString(),
});

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private readonly db: Db) {}

  /** `skill_id → number of agents linking it`, one grouped query. */
  private async agentCounts(skillIds: string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .where(sql`${t.agentSkills.skillId} in ${skillIds}`)
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, Number(r.n)]));
  }

  async list(workspaceId: string): Promise<SkillDto[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    const counts = await this.agentCounts(rows.map((r) => r.id));
    return rows.map((r) => toDto(r, counts.get(r.id) ?? 0));
  }

  async getById(workspaceId: string, id: string): Promise<SkillDto | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    if (!row) return undefined;
    const counts = await this.agentCounts([row.id]);
    return toDto(row, counts.get(row.id) ?? 0);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersionDto[]> {
    const rows = await this.db
      .select({ v: t.skillVersions })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => toVersionDto(r.v));
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersionDto | undefined> {
    const [row] = await this.db
      .select({ v: t.skillVersions })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(
        and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id), eq(t.skillVersions.version, version)),
      );
    return row ? toVersionDto(row.v) : undefined;
  }

  async findByName(workspaceId: string, name: string): Promise<SkillDto | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    if (!row) return undefined;
    const counts = await this.agentCounts([row.id]);
    return toDto(row, counts.get(row.id) ?? 0);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
    try {
      return await this.createInTx(workspaceId, input);
    } catch (err) {
      if (isNameClash(err)) throw new ConflictError(`A skill named "${input.name}" already exists`, { name: input.name });
      throw err;
    }
  }

  private async createInTx(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId,
          name: input.name,
          description: input.description,
          type: input.type,
          source: input.source ?? 'manual',
          body: input.body,
          enabled: input.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return toDto(row!);
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
    opts: { bumpVersion: boolean },
  ): Promise<SkillDto | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(opts.bumpVersion ? { version: sql`${t.skills.version} + 1` } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return undefined;
      if (opts.bumpVersion) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: row.version, body: row.body })
          .onConflictDoNothing();
      }
      const [n] = await tx
        .select({ n: count() })
        .from(t.agentSkills)
        .where(eq(t.agentSkills.skillId, row.id));
      return toDto(row, Number(n?.n ?? 0));
    });
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
