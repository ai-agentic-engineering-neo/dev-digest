/* Pure helpers for MergeConflictsDialog: apply the chosen resolutions to a body. */
import type { ConventionMergeConflict } from "@devdigest/shared";

export const RESOLUTIONS = ["keep_existing", "replace", "keep_both"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Safe default: nothing in the skill changes until the user says so. */
export const DEFAULT_RESOLUTION: Resolution = "keep_existing";

export interface AppliedResolutions {
  body: string;
  /** How many conflicts changed the body (replace / keep both). */
  changed: number;
  /** Rules whose existing excerpt was not found, so they were appended instead. */
  appendedInstead: string[];
}

function append(body: string, block: string): string {
  return `${body.trimEnd()}\n\n${block.trim()}\n`;
}

/**
 * Keep existing → body untouched. Replace with new → the excerpt's FIRST
 * occurrence becomes the rule block (no excerpt / not found → appended, and
 * reported). Keep both → the rule block is appended at the end.
 */
export function applyResolutions(
  body: string,
  conflicts: readonly ConventionMergeConflict[],
  choices: Readonly<Record<string, Resolution>>,
): AppliedResolutions {
  let out = body;
  let changed = 0;
  const appendedInstead: string[] = [];
  for (const c of conflicts) {
    const choice = choices[c.convention_id] ?? DEFAULT_RESOLUTION;
    if (choice === "keep_existing") continue;
    changed += 1;
    if (choice === "keep_both") {
      out = append(out, c.rule_block);
      continue;
    }
    const excerpt = c.existing_excerpt.trim();
    const at = excerpt ? out.indexOf(excerpt) : -1;
    if (at === -1) {
      out = append(out, c.rule_block);
      appendedInstead.push(c.rule);
    } else {
      // indexOf + slice, not String.replace: a `$` in the block must stay literal.
      out = out.slice(0, at) + c.rule_block.trim() + out.slice(at + excerpt.length);
    }
  }
  return { body: out, changed, appendedInstead };
}
