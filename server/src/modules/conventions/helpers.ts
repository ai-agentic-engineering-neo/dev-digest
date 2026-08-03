import type { ConventionCandidate, ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';

/** Row → API DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath,
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status,
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    sample_file_count: row.sampleFileCount,
    source_sha: row.sourceSha,
    model: row.model,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Merge accepted candidates into one skill body: rule + evidence citation per
 * candidate, grouped as sections. `POST /repos/:id/conventions/skill` only
 * ever passes rows already verified `status === 'accepted'`.
 */
export function renderConventionsSkillBody(skillName: string, candidates: ConventionRow[]): string {
  const sections = candidates.map((c) => {
    const citation =
      c.evidencePath && c.evidenceStartLine != null && c.evidenceEndLine != null
        ? `Detected in \`${c.evidencePath}:${c.evidenceStartLine}-${c.evidenceEndLine}\`.`
        : '';
    return [`## ${c.category}`, c.rule, citation].filter(Boolean).join('\n');
  });
  return [
    `# ${skillName}`,
    'House conventions detected in this repo. Flag changes that violate any rule below and cite the offending `file:line`.',
    ...sections,
  ].join('\n\n');
}

/** `skills.evidence_files` — one `path:startLine-endLine` citation per candidate. */
export function evidenceFilesFor(candidates: ConventionRow[]): string[] {
  return candidates
    .filter((c) => c.evidencePath !== null && c.evidenceStartLine != null && c.evidenceEndLine != null)
    .map((c) => `${c.evidencePath}:${c.evidenceStartLine}-${c.evidenceEndLine}`);
}
