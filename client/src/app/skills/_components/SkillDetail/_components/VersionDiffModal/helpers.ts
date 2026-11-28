import type { SkillDraft } from "../../../../helpers";
import { DIFF_FIELDS } from "./constants";

/** A changed scalar field: `from → to`. */
export interface FieldChange {
  field: (typeof DIFF_FIELDS)[number];
  from: string;
  to: string;
}

/** Name, description and type changes between an old version and the current skill. */
export function fieldChanges(older: SkillDraft, current: SkillDraft): FieldChange[] {
  return DIFF_FIELDS.filter((f) => older[f] !== current[f]).map((f) => ({ field: f, from: older[f], to: current[f] }));
}

/** A one-hunk unified patch for the shared DiffViewer. */
export interface LinePatch {
  patch: string;
  additions: number;
  deletions: number;
}

function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/**
 * Line diff of `older` → `newer` by longest common subsequence, emitted as a
 * single unified hunk with full context. `null` when the texts are identical.
 */
export function lineDiffToPatch(older: string, newer: string): LinePatch | null {
  if (older === newer) return null;
  const a = toLines(older);
  const b = toLines(newer);
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = LCS length of a[i..] and b[j..], flattened row-major.
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * (m + 1) + j + 1]! + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j]!, lcs[i * (m + 1) + j + 1]!);
    }
  }
  const rows: string[] = [];
  let additions = 0;
  let deletions = 0;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push(` ${a[i]}`);
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i * (m + 1) + j + 1]! >= lcs[(i + 1) * (m + 1) + j]!)) {
      rows.push(`+${b[j]}`);
      additions++;
      j++;
    } else {
      rows.push(`-${a[i]}`);
      deletions++;
      i++;
    }
  }
  const header = `@@ -${n === 0 ? 0 : 1},${n} +${m === 0 ? 0 : 1},${m} @@`;
  return { patch: [header, ...rows].join("\n"), additions, deletions };
}
