import type { ConventionCandidate } from "@devdigest/shared";
import type { Draft } from "@/components/skill-editor-modal/helpers";
import { CONF_OK, CONF_WARN, RULE_SLUG_WORDS, SKILL_DESCRIPTION_TEMPLATE, SKILL_INTRO } from "./constants";

export function slugify(text: string, maxWords = RULE_SLUG_WORDS): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, maxWords)
    .join("-");
}

/** "acme/payments-api" → "payments-api". */
export function repoShortName(fullName: string): string {
  return fullName.split("/").pop() || fullName;
}

export function confidenceColor(value: number): string {
  if (value >= CONF_OK) return "var(--ok)";
  if (value >= CONF_WARN) return "var(--warn)";
  return "var(--text-muted)";
}

/** Longest backtick run in `text`, so a snippet containing ``` can't close its own fence. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** One skill from the accepted candidates: name, description, markdown body, evidence files. */
export function buildConventionSkillDraft(
  repoFullName: string,
  accepted: ConventionCandidate[],
): { draft: Draft; evidenceFiles: string[] } {
  const repo = repoShortName(repoFullName);
  const name = `${slugify(repo, 8) || "repo"}-conventions`;
  const sections = accepted.map((c) => {
    const heading = slugify(c.rule) || "rule";
    const fence = fenceFor(c.evidence_snippet);
    const evidence = c.evidence_path
      ? `\nDetected in \`${c.evidence_path}\`:\n${fence}\n${c.evidence_snippet}\n${fence}`
      : "";
    return `## ${heading}\n${c.rule}\n${evidence}`.trimEnd();
  });
  const body = [`# ${name}`, "", SKILL_INTRO, "", sections.join("\n\n")].join("\n");
  const evidenceFiles = [...new Set(accepted.map((c) => c.evidence_path).filter(Boolean))];
  return {
    draft: {
      name,
      description: SKILL_DESCRIPTION_TEMPLATE.replace("{repo}", repo),
      type: "convention",
      body,
    },
    evidenceFiles,
  };
}
