import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Agent, AgentVersion, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import type { AgentPatch, AgentStore, LinkSpec, NewAgent, SkillLink } from './ports.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions` and the
 * `agent_skills` link table, and reads no other module's table: skill names
 * and flags come through the skills module's port, and the skills module reads
 * link counts and link ids from here (`enabledLinkCounts`, `enabledSkillIds`).
 *
 * Rows stop here: every method returns the `Agent` / `AgentVersion` contract.
 */

type AgentRow = typeof t.agents.$inferSelect;
type AgentVersionRow = typeof t.agentVersions.$inferSelect;

/** Enabled skill links of the agent (correlated subquery) → `Agent.skill_count`. */
const skillCount = sql<number>`(
  select count(*)::int from ${t.agentSkills}
  where ${t.agentSkills.agentId} = ${t.agents.id} and ${t.agentSkills.enabled} = true
)`;

function toAgent(row: AgentRow, skills: number): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
    skill_count: Number(skills),
  };
}

/**
 * The stored `config_json` is untyped jsonb (a snapshot from an older config
 * shape could drift), so it is parsed through `AgentVersionConfig` here, at the
 * persistence boundary — a malformed snapshot throws rather than leaking an
 * unvalidated blob inward.
 */
function toAgentVersion(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(row.configJson),
    created_at: row.createdAt.toISOString(),
  };
}

export class AgentsRepository implements AgentStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db
      .select({ agent: t.agents, skills: skillCount })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows.map((r) => toAgent(r.agent, r.skills));
  }

  async listEnabled(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db
      .select({ agent: t.agents, skills: skillCount })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    return rows.map((r) => toAgent(r.agent, r.skills));
  }

  async getById(workspaceId: string, id: string): Promise<Agent | undefined> {
    const [row] = await this.db
      .select({ agent: t.agents, skills: skillCount })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row && toAgent(row.agent, row.skills);
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: NewAgent): Promise<Agent> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.agents)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
          provider: values.provider,
          model: values.model,
          systemPrompt: values.systemPrompt,
          outputSchema: (values.outputSchema as object | undefined) ?? null,
          ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
          ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
          ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
          enabled: values.enabled ?? true,
          version: INITIAL_AGENT_VERSION,
          createdBy: values.createdBy ?? null,
        })
        .returning();
      await this.snapshotVersion(tx, row!);
      return toAgent(row!, 0);
    });
  }

  /**
   * Apply a patch. Whether the patch is a config change is the service's
   * decision (domain.ts `isConfigChange`); when it is, the service passes
   * `bumpVersion` and this method increments the version in SQL and snapshots
   * the returned row into agent_versions (reproducibility for eval), in one
   * transaction — concurrent updates serialize on the row lock.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: AgentPatch,
    bumpVersion?: boolean,
  ): Promise<Agent | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.agents)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
          ...(patch.model !== undefined ? { model: patch.model } : {}),
          ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
          ...(patch.outputSchema !== undefined
            ? { outputSchema: patch.outputSchema as object }
            : {}),
          ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
          ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
          ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bumpVersion ? { version: sql`${t.agents.version} + 1` } : {}),
        })
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
        .returning();

      if (!row) return undefined;
      if (bumpVersion) await this.snapshotVersion(tx, row);
      return toAgent(row, await this.enabledLinkCount(tx, row.id));
    });
  }

  /** Snapshot the row's current config as the version it carries. A collision
   *  on (agent_id, version) is a real error and must surface. */
  private async snapshotVersion(exec: DbExecutor, row: AgentRow): Promise<void> {
    const links = await this.linkedSkillsOn(exec, row.id);
    const skills = links.map((l) => l.skillId);
    const skillLinks = links.map((l) => ({ skill_id: l.skillId, enabled: l.enabled }));
    await exec
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version: row.version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
          skill_links: skillLinks,
        },
      });
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersion[]> {
    const rows = await this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
    return rows.map(toAgentVersion);
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row && toAgentVersion(row);
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** The agent's links (link columns only), in `order` ascending. */
  async linkedSkills(agentId: string): Promise<SkillLink[]> {
    return this.linkedSkillsOn(this.db, agentId);
  }

  private async linkedSkillsOn(exec: DbExecutor, agentId: string): Promise<SkillLink[]> {
    return exec
      .select({
        skillId: t.agentSkills.skillId,
        order: t.agentSkills.order,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order), asc(t.agentSkills.skillId));
  }

  /** Skill ids of the agent's links that are enabled on the link, in link order. */
  async enabledSkillIds(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.enabled, true)))
      .orderBy(asc(t.agentSkills.order), asc(t.agentSkills.skillId));
    return rows.map((r) => r.skillId);
  }

  /** Per skill id, how many agents link it with the link enabled. Absent ids have none. */
  async enabledLinkCounts(skillIds: readonly string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .where(and(inArray(t.agentSkills.skillId, [...skillIds]), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, Number(r.n)]));
  }

  private async enabledLinkCount(exec: DbExecutor, agentId: string): Promise<number> {
    const [row] = await exec
      .select({ n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.enabled, true)));
    return Number(row?.n ?? 0);
  }

  /**
   * Bump the agent's version, replace its links with `links` (order = index)
   * and snapshot the config with the new links — one transaction, so an eval
   * replay of a version knows which skills it had and which were enabled.
   */
  async setSkills(agentId: string, links: LinkSpec[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Bump first: the row lock serializes concurrent link changes.
      const [row] = await tx
        .update(t.agents)
        .set({ version: sql`${t.agents.version} + 1` })
        .where(eq(t.agents.id, agentId))
        .returning();
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (links.length > 0) {
        await tx
          .insert(t.agentSkills)
          .values(links.map((l, i) => ({ agentId, skillId: l.skillId, enabled: l.enabled, order: i })));
      }
      if (row) await this.snapshotVersion(tx, row);
    });
  }
}
