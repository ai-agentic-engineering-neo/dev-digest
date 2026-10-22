import type { ConventionCandidate } from "@devdigest/shared";

type BodyCandidate = Pick<
  ConventionCandidate,
  "category" | "rule" | "evidence_path" | "evidence_start_line" | "evidence_end_line" | "evidence_snippet"
>;

/** `payments-api` → `payments-api-conventions` (lower-case, slug-safe). */
export function suggestSkillName(repoName: string | undefined): string {
  const slug = (repoName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-conventions` : "repo-conventions";
}

function citation(c: BodyCandidate): string | null {
  if (!c.evidence_path || c.evidence_start_line == null || c.evidence_end_line == null) return null;
  return `${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}`;
}

function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((m) => m.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Default skill body for the modal — MUST match `renderConventionsSkillBody`
 * in server/src/modules/conventions/helpers.ts (the server uses it when no body is sent).
 */
export function renderConventionsSkillBodyPreview(
  skillName: string,
  repoName: string,
  candidates: BodyCandidate[],
): string {
  const sections = candidates.map((c) => {
    const parts = [`## ${c.category}`, c.rule];
    const cite = citation(c);
    if (cite && c.evidence_snippet) {
      const fence = fenceFor(c.evidence_snippet);
      parts.push(`Detected in \`${cite}\`:\n${fence}\n${c.evidence_snippet.trimEnd()}\n${fence}`);
    } else if (cite) {
      parts.push(`Detected in \`${cite}\`.`);
    }
    return parts.join("\n\n");
  });
  return [
    `# ${skillName}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join("\n\n");
}
