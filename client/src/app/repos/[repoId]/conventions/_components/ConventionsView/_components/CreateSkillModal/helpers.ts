import type { ConventionCandidate } from "@devdigest/shared";

/**
 * Client-side default body preview — mirrors the server's
 * `renderConventionsSkillBody` (server/src/modules/conventions/helpers.ts).
 * Duplicated deliberately: the modal needs to show and let the user EDIT the
 * body before any request goes out, and the candidates are already loaded
 * client-side, so generating the preview locally avoids a network round trip
 * just to populate a textarea the user is about to change anyway. The server
 * renders its own default whenever `body` is omitted, so an edited body is
 * never required — only offered.
 */
export function renderConventionsSkillBodyPreview(
  skillName: string,
  candidates: ConventionCandidate[],
): string {
  const sections = candidates.map((c) => {
    const citation =
      c.evidence_path && c.evidence_start_line != null && c.evidence_end_line != null
        ? `Detected in \`${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}\`.`
        : "";
    return [`## ${c.category}`, c.rule, citation].filter(Boolean).join("\n");
  });
  return [
    `# ${skillName}`,
    "House conventions detected in this repo. Flag changes that violate any rule below and cite the offending `file:line`.",
    ...sections,
  ].join("\n\n");
}

/** `payments-api` → `payments-api-conventions`; falls back to `repo-conventions`
 *  for a full_name with no usable slug (e.g. an org-only name). */
export function suggestSkillName(repoFullName: string | null): string {
  const repoPart = (repoFullName ?? "").split("/").pop() ?? "";
  const slug = repoPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-conventions` : "repo-conventions";
}
