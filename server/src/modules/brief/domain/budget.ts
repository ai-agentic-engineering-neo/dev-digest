import { BRIEF_CHARS_PER_TOKEN } from '../constants.js';
import type { BriefFacts, BriefTruncation } from './types.js';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / BRIEF_CHARS_PER_TOKEN);
}

export type FitBudgetResult =
  | { ok: true; facts: BriefFacts; truncated: BriefTruncation; tokens: number }
  | { ok: false; tokens: number };

/**
 * AC-20. Cuts one item at a time and stops as soon as the input fits:
 * (1) spec docs from the end, (2) blast callers from the end, (3) hunk ranges of boilerplate files
 * from the end. PR metadata, intent, linked issues and each file's path/counts/role are never cut.
 */
export function fitBudget(
  facts: BriefFacts,
  measure: (f: BriefFacts) => number,
  limit: number,
): FitBudgetResult {
  const truncated: BriefTruncation = { spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 };
  let cur: BriefFacts = facts;
  let tokens = measure(cur);
  if (tokens <= limit) return { ok: true, facts: cur, truncated, tokens };

  while (cur.specDocs.length > 0) {
    cur = { ...cur, specDocs: cur.specDocs.slice(0, -1) };
    truncated.spec_docs += 1;
    tokens = measure(cur);
    if (tokens <= limit) return { ok: true, facts: cur, truncated, tokens };
  }

  while (cur.blast && cur.blast.callers.length > 0) {
    cur = { ...cur, blast: { ...cur.blast, callers: cur.blast.callers.slice(0, -1) } };
    truncated.callers += 1;
    tokens = measure(cur);
    if (tokens <= limit) return { ok: true, facts: cur, truncated, tokens };
  }

  for (let i = cur.files.length - 1; i >= 0; i--) {
    const f = cur.files[i];
    if (!f || f.role !== 'boilerplate' || f.hunks.length === 0) continue;
    const files = cur.files.slice();
    files[i] = { ...f, hunks: [] };
    cur = { ...cur, files };
    truncated.boilerplate_hunk_files += 1;
    tokens = measure(cur);
    if (tokens <= limit) return { ok: true, facts: cur, truncated, tokens };
  }

  return { ok: false, tokens };
}
