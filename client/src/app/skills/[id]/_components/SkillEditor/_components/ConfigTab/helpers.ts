/** Filename-looking slug for the skill body panel header, e.g. "PR Quality
    Rubric" -> "pr-quality-rubric.md". Display only — not persisted. */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "skill";
}

/** Rough token estimate for the body panel's "≈N tokens" label. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
