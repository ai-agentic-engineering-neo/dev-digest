import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the agent's Skills tab. `linked` = has an agent_skills row. */
export interface SkillRow {
  skill: Skill;
  linked: boolean;
  /** Checked: the link is enabled (goes into the prompt if the skill is enabled too). */
  enabled: boolean;
}

/** Linked skills first in their saved order, then every other workspace skill by name. */
export function buildRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => {
      const skill = byId.get(l.skill_id);
      return skill ? [{ skill, linked: true, enabled: l.enabled }] : [];
    });
  const linkedIds = new Set(linked.map((r) => r.skill.id));
  const rest = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false, enabled: false }));
  return [...linked, ...rest];
}

/** Checking an unlinked skill links + enables it; otherwise flips the link's enabled flag. */
export function toggleRow(rows: SkillRow[], skillId: string): SkillRow[] {
  return rows.map((r) => (r.skill.id === skillId ? { ...r, linked: true, enabled: !r.enabled } : r));
}

/**
 * Move a row. Reordering pins the whole visible order, so every row becomes
 * linked (unchecked ones stay disabled — they keep their slot, not the prompt).
 */
export function moveRow(rows: SkillRow[], from: number, to: number): SkillRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = rows.map((r) => ({ ...r, linked: true }));
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Payload for PUT /agents/:id/skills — linked rows in display order. */
export function toLinkItems(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return rows.filter((r) => r.linked).map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** Rows that actually reach the prompt: link enabled AND skill enabled. */
export function activeCount(rows: SkillRow[]): number {
  return rows.filter((r) => r.linked && r.enabled && r.skill.enabled).length;
}

export function filterRows(rows: SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.skill.name.toLowerCase().includes(q) || r.skill.type.includes(q));
}
