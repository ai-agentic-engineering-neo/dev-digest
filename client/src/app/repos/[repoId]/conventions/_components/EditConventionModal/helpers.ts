/* Pure helpers for EditConventionModal: the form → the one PATCH to send. */
import type { ConventionCandidate, ConventionCategory, UpdateConventionInput } from "@devdigest/shared";
import { categoryOf } from "../../helpers";

export interface EditForm {
  rule: string;
  category: ConventionCategory;
  badExample: string;
  /** Evidence indices marked for removal. */
  removed: number[];
}

export function formFrom(c: ConventionCandidate): EditForm {
  return { rule: c.rule, category: categoryOf(c), badExample: c.bad_example ?? "", removed: [] };
}

/**
 * The ONE PATCH body to send (all removals in `remove_evidence_indices`, applied
 * atomically by the server under a row lock), or null when nothing changed.
 */
export function buildPatch(c: ConventionCandidate, f: EditForm): UpdateConventionInput | null {
  const patch: UpdateConventionInput = {};
  const rule = f.rule.trim();
  if (rule !== c.rule) patch.rule = rule;
  if (f.category !== categoryOf(c)) patch.category = f.category;
  const bad = f.badExample.trim();
  if (bad !== (c.bad_example ?? "")) patch.bad_example = bad || null;
  const removals = [...new Set(f.removed)].sort((a, b) => a - b);
  if (removals.length > 0) patch.remove_evidence_indices = removals;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** An index may be removed only while at least one other evidence stays. */
export function canRemove(total: number, removed: readonly number[], index: number): boolean {
  if (removed.includes(index)) return true; // toggling back is always allowed
  return total - removed.length > 1;
}
