import { SkillName, type ConventionCandidate, type ConventionSkillInput } from "@devdigest/shared";

/** What the modal edits before the skill is saved: the contract minus the ids, `enabled` always set. */
export type ConventionSkillDraft = Required<Omit<ConventionSkillInput, "convention_ids">>;

/** Translated pieces of the generated body (helpers do not call `t`). */
export interface BodyText {
  intro: string;
  detectedIn: (location: string) => string;
  /** Heading for candidates without a category. */
  fallbackCategory: string;
}

/**
 * Markdown body from the accepted candidates: a title, the reviewer
 * instruction, then one `## category` section per category with each rule and
 * where it was detected. Only the candidates passed in are used.
 */
export function buildSkillBody(
  name: string,
  accepted: readonly Pick<ConventionCandidate, "category" | "rule">[],
  locations: readonly string[],
  text: BodyText,
): string {
  const sections = new Map<string, string[]>();
  accepted.forEach((c, i) => {
    const category = c.category?.trim() || text.fallbackCategory;
    const entry = `${c.rule.trim()}\n${text.detectedIn(locations[i] ?? "")}`;
    sections.set(category, [...(sections.get(category) ?? []), entry]);
  });
  const parts = [`# ${name}`, text.intro];
  for (const [category, entries] of sections) parts.push(`## ${category}\n${entries.join("\n\n")}`);
  return `${parts.join("\n\n")}\n`;
}

/** Name is a valid slug, description and body are not blank. */
export function canSaveSkillDraft(d: ConventionSkillDraft): boolean {
  return SkillName.safeParse(d.name).success && d.description.trim() !== "" && d.body.trim() !== "";
}
