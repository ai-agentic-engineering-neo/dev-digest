/* Pure helpers for the Overview tab's "at a glance" strip and section state. */

export const OVERVIEW_SECTIONS = ["brief", "intent", "blast", "description"] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

/** URL value → a known section (unknown / missing → the brief). */
export function toSection(value: string | null | undefined): OverviewSection {
  return (OVERVIEW_SECTIONS as readonly string[]).includes(value ?? "") ? (value as OverviewSection) : "brief";
}

/** Markdown → readable plain text: drops HTML comments/tags, code fences, link targets and markup characters. */
export function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first meaningful line of a PR body (skipping a bare "Summary"-style heading). */
export function descriptionPreview(body: string | null | undefined): string | null {
  if (!body) return null;
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && plainText(line).split(" ").length <= 3) continue; // "## Summary"
    const text = plainText(line);
    if (text) return text;
  }
  return null;
}

export function wordCount(body: string | null | undefined): number {
  const text = body ? plainText(body) : "";
  return text ? text.split(" ").length : 0;
}
