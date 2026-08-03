import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab: a workspace skill + this agent's link state. */
export interface SkillRowModel {
  skill: Skill;
  /** A link row exists (possibly switched off — the link survives unchecking). */
  linked: boolean;
  /** The per-agent gate: checked in the UI, injected into the prompt. */
  enabled: boolean;
}

/**
 * Every workspace skill as a row, in prompt order.
 *
 * Order = linked skills by `order` ascending (that IS the order of blocks in
 * the assembled prompt), then the never-linked ones in catalogue order.
 * `pendingOrder` overrides both while a drag is being persisted, so the list
 * does not snap back for the width of a round-trip.
 */
export function buildRows(
  skills: Skill[],
  links: AgentSkillLink[],
  pendingOrder?: string[] | null,
): SkillRowModel[] {
  const bySkillId = new Map(links.map((l) => [l.skill_id, l]));
  const rows: SkillRowModel[] = skills.map((skill) => {
    const link = bySkillId.get(skill.id);
    return { skill, linked: link !== undefined, enabled: link?.enabled === true };
  });

  const rank = new Map<string, number>();
  if (pendingOrder && pendingOrder.length > 0) {
    pendingOrder.forEach((id, i) => rank.set(id, i));
  } else {
    [...links].sort((a, b) => a.order - b.order).forEach((l, i) => rank.set(l.skill_id, i));
  }

  // Unranked rows keep catalogue order behind every ranked one.
  return rows
    .map((row, i) => ({ row, key: rank.get(row.skill.id) ?? rank.size + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.row);
}

function reorder(ids: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Row ids after dropping `fromId` onto `toId`'s slot. */
export function moveOnto(rows: SkillRowModel[], fromId: string, toId: string): string[] {
  const ids = rows.map((r) => r.skill.id);
  return reorder(ids, ids.indexOf(fromId), ids.indexOf(toId));
}

/** Row ids after nudging `id` by `delta` slots (keyboard reordering). */
export function moveBy(rows: SkillRowModel[], id: string, delta: number): string[] {
  const ids = rows.map((r) => r.skill.id);
  const from = ids.indexOf(id);
  return reorder(ids, from, from + delta);
}

/**
 * The ids `POST /agents/:id/skills` may be given: it REPLACES the whole link
 * set, so an unlinked row in the payload would be silently attached. Reordering
 * must move linked skills only.
 */
export function linkedIdsInOrder(rows: SkillRowModel[], order: string[]): string[] {
  const linked = new Set(rows.filter((r) => r.linked).map((r) => r.skill.id));
  return order.filter((id) => linked.has(id));
}

/** Name/description substring match for the filter input. */
export function matchesFilter(skill: Skill, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle)
  );
}
