import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Skill ids linked to the agent, in persisted order. */
export function linkedIdsInOrder(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/** Merge every workspace skill + the agent's linked skills into one ordered
    id list: linked skills first (in their persisted order), then every other
    skill in the workspace (unchecked). Callers reorder this list via drag
    and drop; checked state is tracked separately. */
export function mergeSkillOrder(skills: Skill[], links: AgentSkillLink[]): string[] {
  const linked = linkedIdsInOrder(links);
  const linkedSet = new Set(linked);
  const rest = skills.map((s) => s.id).filter((id) => !linkedSet.has(id));
  return [...linked, ...rest];
}

/** Case-insensitive substring filter over skill names. */
export function filterSkillsByName(skills: Skill[], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  if (!q) return new Set(skills.map((s) => s.id));
  return new Set(skills.filter((s) => s.name.toLowerCase().includes(q)).map((s) => s.id));
}

/** Move `dragId` to sit just before `dropId` within `order` (id-based, so
    it's stable even when the visible list is filtered). */
export function reorder(order: string[], dragId: string, dropId: string): string[] {
  if (dragId === dropId) return order;
  const next = [...order];
  const from = next.indexOf(dragId);
  if (from === -1) return order;
  next.splice(from, 1);
  const to = next.indexOf(dropId);
  if (to === -1) return order;
  next.splice(to, 0, dragId);
  return next;
}
