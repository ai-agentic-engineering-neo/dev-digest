import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "../../constants";
import { evidenceLabel } from "../ConventionCard/helpers";

export interface BodyLabels {
  title: string;
  evidence: string;
  category: (c: ConventionCategory) => string;
}

/** Indent every line so a fenced block stays inside its list item. */
const indent = (text: string, pad = "  ") =>
  text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");

/**
 * The skill body: a title, then one `## <Category>` section per category (in
 * contract order) with each rule as a bold list item, its `path:line` and the
 * verified snippet — the evidence tells the reviewer what "following it" looks like.
 */
export function buildSkillBody(items: ConventionCandidate[], labels: BodyLabels): string {
  const sections = CONVENTION_CATEGORIES
    .map((category) => {
      const rules = items.filter((i) => i.category === category);
      if (rules.length === 0) return null;
      const entries = rules.map((r) => {
        const lines = [`- **${r.rule.trim()}**`];
        if (r.evidence_path) lines.push(`  ${labels.evidence}: \`${evidenceLabel(r)}\``);
        if (r.evidence_snippet.trim()) lines.push(indent("```\n" + r.evidence_snippet.replace(/\s+$/, "") + "\n```"));
        return lines.join("\n");
      });
      return `## ${labels.category(category)}\n\n${entries.join("\n\n")}`;
    })
    .filter((x): x is string => x !== null);
  return [`# ${labels.title}`, ...sections].join("\n\n") + "\n";
}

/** Distinct evidence files, in first-seen order (stored as the skill's evidence_files). */
export function evidenceFiles(items: ConventionCandidate[]): string[] {
  return [...new Set(items.map((i) => i.evidence_path).filter(Boolean))];
}
