import { and, asc, count, desc, eq, gte, min } from 'drizzle-orm';
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import {
  isSkillContentChange,
  isTrustedSkillSource,
  versionNote,
  type PromptSkill,
  type SkillStatsData,
} from './domain.js';
import type { NewSkill, SkillPatch, SkillsRepositoryPort, SkillVersionRecord } from './ports.js';

/**
 * Skills data-access. Owns `skills` + `skill_versions`; reads `agent_skills`
 * (owned by the agents module) only to resolve an agent's prompt skills and
 * link counts. Workspace-scoped throughout (no global guard — see INSIGHTS).
 */

type SkillRow = typeof t.skills.$inferSelect;

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toSkill);
  }

  private async row(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getById(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.row(workspaceId, id);
    return row ? toSkill(row) : undefined;
  }

  async getByName(workspaceId: string, name: string): Promise<Skill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row ? toSkill(row) : undefined;
  }

  async insert(values: NewSkill): Promise<Skill> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({
          skillId: row!.id,
          version: INITIAL_SKILL_VERSION,
          body: row!.body,
          note: versionNote(values.note, true),
        });
      if (values.linkAgentId) {
        // Atomic with the insert: a failed link must not leave an orphan skill
        // whose retry then hits 409 on the name.
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(t.agentSkills)
          .where(eq(t.agentSkills.agentId, values.linkAgentId));
        await tx
          .insert(t.agentSkills)
          .values({ agentId: values.linkAgentId, skillId: row!.id, order: Number(n) });
      }
      return toSkill(row!);
    });
  }

  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      if (!existing) return undefined;

      const contentChanged = isSkillContentChange(
        {
          name: existing.name,
          description: existing.description,
          type: existing.type as SkillType,
          body: existing.body,
        },
        patch,
      );
      const nextVersion = contentChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(contentChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (contentChanged) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: id, version: nextVersion, body: row!.body, note: versionNote(patch.note, false) });
      }
      return toSkill(row!);
    });
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersionRecord[] | undefined> {
    if (!(await this.row(workspaceId, id))) return undefined;
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => ({
      skill_id: r.skillId,
      version: r.version,
      body: r.body,
      note: r.note ?? null,
      created_at: r.createdAt.toISOString(),
    }));
  }

  async promptSkillsForAgent(workspaceId: string, agentId: string): Promise<PromptSkill[]> {
    const rows = await this.db
      .select({
        id: t.skills.id,
        version: t.skills.version,
        name: t.skills.name,
        body: t.skills.body,
        source: t.skills.source,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      name: r.name,
      body: r.body,
      trusted: isTrustedSkillSource(r.source as SkillSource),
    }));
  }

  async linkCounts(workspaceId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    return Object.fromEntries(rows.map((r) => [r.skillId, Number(r.n)]));
  }

  async recordRunSkills(runId: string, skills: { id: string; version: number }[]): Promise<void> {
    if (skills.length === 0) return;
    await this.db
      .insert(t.runSkills)
      .values(skills.map((sk, position) => ({ runId, skillId: sk.id, skillVersion: sk.version, position })))
      .onConflictDoNothing();
  }

  async statsData(workspaceId: string, since: Date): Promise<SkillStatsData> {
    // Runs made before run attribution shipped have no run_skills rows; counting
    // them would read as "skill not used" (0% pull). Start the window at the
    // workspace's first attributed run instead — no attributed run → no runs.
    const [first] = await this.db
      .select({ at: min(t.agentRuns.ranAt) })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.runSkills.runId, t.agentRuns.id))
      .where(eq(t.agentRuns.workspaceId, workspaceId));
    const start = first?.at && first.at > since ? first.at : since;
    const runs = first?.at
      ? await this.db
          .select({ id: t.agentRuns.id, agentId: t.agentRuns.agentId })
          .from(t.agentRuns)
          .where(and(eq(t.agentRuns.workspaceId, workspaceId), gte(t.agentRuns.ranAt, start)))
      : [];
    const links = await this.db
      .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId));
    if (runs.length === 0) return { runs: [], runSkills: [], links, findings: [] };

    // Same window as `runs`, expressed as a JOIN — never a list of run ids, which
    // would hit Postgres's 65535 bind-parameter limit on a busy workspace.
    const inWindow = and(eq(t.agentRuns.workspaceId, workspaceId), gte(t.agentRuns.ranAt, start));
    const runSkills = await this.db
      .select({ runId: t.runSkills.runId, skillId: t.runSkills.skillId })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.runSkills.runId, t.agentRuns.id))
      .where(inWindow);
    const findingRows = await this.db
      .select({
        runId: t.reviews.runId,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
      .where(and(inWindow, eq(t.reviews.workspaceId, workspaceId), eq(t.findings.kind, 'finding')));
    return {
      runs,
      runSkills,
      links,
      findings: findingRows.map((f) => ({
        runId: f.runId!,
        category: f.category,
        accepted: f.acceptedAt !== null,
        dismissed: f.dismissedAt !== null,
      })),
    };
  }

  async linkedAgents(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));
  }
}
