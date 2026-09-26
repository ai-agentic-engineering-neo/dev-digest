/**
 * skills — Drizzle repository (ring 3a).
 *
 * The only file in the module that knows the table. Implements
 * `SkillsRepositoryPort`, maps rows to DTOs before they leave, scopes every
 * query by `workspaceId`, and owns the transaction for the versioned writes.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { CreateSkillInput, SkillDto, SkillsRepositoryPort, UpdateSkillInput } from './ports.js';

type SkillRow = typeof t.skills.$inferSelect;

const toDto = (row: SkillRow): SkillDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  type: row.type,
  source: row.source,
  body: row.body,
  enabled: row.enabled,
  version: row.version,
  evidence_files: row.evidenceFiles ?? null,
});

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<SkillDto[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toDto);
  }

  async getById(workspaceId: string, id: string): Promise<SkillDto | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toDto(row) : undefined;
  }

  async findByName(workspaceId: string, name: string): Promise<SkillDto | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row ? toDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
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
      return toDto(row);
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
