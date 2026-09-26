/**
 * skills — Drizzle repository (ring 3a).
 *
 * The only file in the module that knows the table. Implements
 * `SkillsRepositoryPort`, maps rows to DTOs before they leave, scopes every
 * query by `workspaceId`, and owns the transaction for the versioned write.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CreateSkillInput, SkillDto, SkillsRepositoryPort } from './ports.js';

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
  created_at: row.createdAt.toISOString(),
});

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<SkillDto[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
    return rows.map(toDto);
  }

  async getById(workspaceId: string, id: string): Promise<SkillDto | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: 'manual',
        body: input.body,
      })
      .returning();
    return toDto(row!);
  }

  async saveNewVersion(workspaceId: string, id: string, body: string): Promise<SkillDto | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ body, version: sql`${t.skills.version} + 1` })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return undefined;
      await tx.insert(t.skillVersions).values({ skillId: row.id, version: row.version, body });
      return toDto(row);
    });
  }
}
