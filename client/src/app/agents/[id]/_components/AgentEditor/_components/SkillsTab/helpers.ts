import { arrayMove } from "@dnd-kit/sortable";
import type { AgentSkillLink, Skill } from "@devdigest/shared";

/**
 * Initial display order for the Skills tab's single merged list: linked
 * skills first (sorted by their link `order`), then unlinked skills appended
 * at the end (stable, by name).
 */
export function computeInitialOrder(skills: Skill[], links: AgentSkillLink[]): string[] {
  const orderById = new Map(links.map((l) => [l.skill_id, l.order]));
  const linked = skills
    .filter((sk) => orderById.has(sk.id))
    .sort((a, b) => orderById.get(a.id)! - orderById.get(b.id)!);
  const unlinked = skills
    .filter((sk) => !orderById.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...linked, ...unlinked].map((sk) => sk.id);
}

/** Which skill ids start out linked (checked). */
export function computeInitialChecked(links: AgentSkillLink[]): Set<string> {
  return new Set(links.map((l) => l.skill_id));
}

/**
 * The `skill_ids` payload for `useSetAgentSkills`: the full displayed order,
 * filtered down to only the checked (linked) rows, in their relative order.
 * Unchecked rows are simply omitted — this is the whole "toggle = link/unlink"
 * design: a freshly re-checked row already sits at the end of `rows` (unlinked
 * rows are appended there by `computeInitialOrder`), so it naturally lands
 * last among the checked ids without any special-casing here.
 */
export function checkedOrder(rows: string[], checked: Set<string>): string[] {
  return rows.filter((id) => checked.has(id));
}

/**
 * Reorders only the ids in `visibleIds` (e.g. the subset left after a search
 * filter) relative to each other, leaving every other row's slot in `rows`
 * untouched — so dragging while filtered only reshuffles the visible rows.
 * With no filter applied, `visibleIds === rows` and this is a plain
 * `arrayMove`.
 */
export function reorderVisible(rows: string[], visibleIds: string[], activeId: string, overId: string): string[] {
  const oldIndex = visibleIds.indexOf(activeId);
  const newIndex = visibleIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) return rows;
  const reordered = arrayMove(visibleIds, oldIndex, newIndex);
  const visibleSet = new Set(visibleIds);
  let i = 0;
  return rows.map((id) => (visibleSet.has(id) ? reordered[i++]! : id));
}
