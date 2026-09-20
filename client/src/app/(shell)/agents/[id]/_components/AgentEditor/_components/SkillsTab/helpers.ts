import type { AgentAttachedSkill, Skill } from "@devdigest/shared";

/** One row of the Skills tab list: every workspace skill, joined with its
    per-agent link (if attached). */
export interface SkillRow {
  skill_id: string;
  name: string;
  description: string;
  type: Skill["type"];
  source: Skill["source"];
  skill_enabled: boolean; // the skill's own global flag
  attached: boolean; // is it linked to this agent at all
  enabled: boolean; // per-agent link flag — meaningless when !attached
}

/** Attached skills first (sorted by `order`), then the rest of the workspace's
    skills, unattached. Array position of the attached prefix IS the order. */
export function buildRows(skills: Skill[], links: AgentAttachedSkill[]): SkillRow[] {
  const linkedIds = new Set(links.map((l) => l.skill_id));
  const attached: SkillRow[] = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      skill_id: l.skill_id,
      name: l.name,
      description: l.description,
      type: l.type,
      source: l.source,
      skill_enabled: l.skill_enabled,
      attached: true,
      enabled: l.enabled,
    }));
  const unattached: SkillRow[] = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .map((sk) => ({
      skill_id: sk.id,
      name: sk.name,
      description: sk.description,
      type: sk.type,
      source: sk.source,
      skill_enabled: sk.enabled,
      attached: false,
      enabled: false,
    }));
  return [...attached, ...unattached];
}

/**
 * The attached rows as the links the server will return — attached only, array
 * position becomes `order`. The mutation both derives its payload from this and
 * writes it into the query cache optimistically, so the shape has to be the
 * server's, not a payload of its own.
 */
export function toAttachedLinks(agentId: string, rows: SkillRow[]): AgentAttachedSkill[] {
  return rows
    .filter((r) => r.attached)
    .map((r, order) => ({
      agent_id: agentId,
      skill_id: r.skill_id,
      order,
      enabled: r.enabled,
      name: r.name,
      description: r.description,
      type: r.type,
      source: r.source,
      skill_enabled: r.skill_enabled,
    }));
}
