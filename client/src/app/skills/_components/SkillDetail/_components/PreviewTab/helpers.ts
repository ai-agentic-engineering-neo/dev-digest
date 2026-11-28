import type { SkillDraft } from "../../../../helpers";

/** Whether the draft has no body yet (blank after trimming). */
export function isEmptyBody(draft: Pick<SkillDraft, "body">): boolean {
  return draft.body.trim() === "";
}

/**
 * The block exactly as the model receives it (reviewer-core `formatSkills`):
 * `### {name}`, the italic description, then the body.
 */
export function previewMarkdown(draft: SkillDraft): string {
  const description = draft.description.trim();
  return [`### ${draft.name}`, description ? `_${description}_` : "", draft.body].filter((p) => p !== "").join("\n\n");
}
