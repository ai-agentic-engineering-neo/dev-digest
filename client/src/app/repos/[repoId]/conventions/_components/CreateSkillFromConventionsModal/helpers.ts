/* Pure helpers for CreateSkillFromConventionsModal. */

/**
 * The server builds the body with the draft name as its `# heading`, and
 * rebuilds it with the final name on create — so the preview swaps the heading
 * to whatever name is typed now.
 */
export function previewBody(body: string, name: string): string {
  return body.startsWith("# ") ? body.replace(/^# [^\n]*/, `# ${name}`) : body;
}
