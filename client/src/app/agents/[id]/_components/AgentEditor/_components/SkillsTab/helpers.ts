import type { AgentSkillView, SetAgentSkillsInput, Skill } from "@devdigest/shared";

/** One row of the agent's Skills tab (every workspace skill appears once). */
export interface SkillRow {
  skillId: string;
  name: string;
  description: string;
  type: Skill["type"];
  source: Skill["source"];
  /** Checked = in this agent's prompt. */
  enabled: boolean;
  /** The skill's own global switch (Skills page). */
  skillEnabled: boolean;
}

/**
 * Linked skills first, in the agent's order; then every other workspace skill
 * (unchecked) alphabetically — so attaching a new skill is just ticking it.
 */
export function buildRows(all: Skill[], links: AgentSkillView[]): SkillRow[] {
  const linked = [...links].sort((a, b) => a.order - b.order);
  const linkedIds = new Set(linked.map((l) => l.skill_id));
  const rows: SkillRow[] = linked.map((l) => ({
    skillId: l.skill_id,
    name: l.name,
    description: l.description,
    type: l.type,
    source: l.source,
    enabled: l.enabled,
    skillEnabled: l.skill_enabled,
  }));
  for (const sk of [...all].sort((a, b) => a.name.localeCompare(b.name))) {
    if (linkedIds.has(sk.id)) continue;
    rows.push({
      skillId: sk.id,
      name: sk.name,
      description: sk.description,
      type: sk.type,
      source: sk.source,
      enabled: false,
      skillEnabled: sk.enabled,
    });
  }
  return rows;
}

/** Move the item at `from` to `to` (clamped); returns a new array. */
export function move<T>(list: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (from === target || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/** The PUT body: the full ordered list (unchecked rows keep their position). */
export function toInput(rows: SkillRow[]): SetAgentSkillsInput {
  return { skills: rows.map((r) => ({ skill_id: r.skillId, enabled: r.enabled })) };
}

export function sameRows(a: SkillRow[], b: SkillRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.skillId === b[i]!.skillId && r.enabled === b[i]!.enabled)
  );
}

export function matches(row: SkillRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.name.toLowerCase().includes(q) || row.type.includes(q);
}
