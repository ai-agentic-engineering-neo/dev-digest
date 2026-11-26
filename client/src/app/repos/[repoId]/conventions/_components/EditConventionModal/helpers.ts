/* Pure helpers for EditConventionModal: the form → the PATCH requests to send. */
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
 * The PATCH bodies to send, in order. The API removes one evidence per request,
 * so removals go highest index first (earlier indices stay valid); the field
 * changes ride on the first request. Empty when nothing changed.
 */
export function buildPatches(c: ConventionCandidate, f: EditForm): UpdateConventionInput[] {
  const fields: UpdateConventionInput = {};
  const rule = f.rule.trim();
  if (rule !== c.rule) fields.rule = rule;
  if (f.category !== categoryOf(c)) fields.category = f.category;
  const bad = f.badExample.trim();
  if (bad !== (c.bad_example ?? "")) fields.bad_example = bad || null;

  const removals = [...new Set(f.removed)].sort((a, b) => b - a);
  const out: UpdateConventionInput[] = [];
  const [first, ...rest] = removals;
  if (Object.keys(fields).length > 0 || first !== undefined) {
    out.push({ ...fields, ...(first !== undefined ? { remove_evidence_index: first } : {}) });
  }
  for (const idx of rest) out.push({ remove_evidence_index: idx });
  return out;
}

/** An index may be removed only while at least one other evidence stays. */
export function canRemove(total: number, removed: readonly number[], index: number): boolean {
  if (removed.includes(index)) return true; // toggling back is always allowed
  return total - removed.length > 1;
}
