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

/** What the skill body needs from a candidate — the DTO shape, so the client renders the same text. */
type BodyCandidate = Pick<
  ConventionCandidate,
  'category' | 'rule' | 'evidence_path' | 'evidence_start_line' | 'evidence_end_line' | 'evidence_snippet'
>;

function citation(c: BodyCandidate): string | null {
  if (!c.evidence_path || c.evidence_start_line == null || c.evidence_end_line == null) return null;
  return `${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}`;
}

/** A code fence longer than any backtick run inside the snippet, so it can't close early. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * Merge accepted candidates into one skill body: a heading per candidate with
 * the rule, its `file:line` citation and the verified snippet.
 * Keep in sync with `renderConventionsSkillBodyPreview` in the client.
 */
export function renderConventionsSkillBody(
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
    return parts.join('\n\n');
  });
  return [
    `# ${skillName}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join('\n\n');
}

/** `skills.evidence_files` — one `path:start-end` citation per candidate that has one. */
export function evidenceFilesFor(candidates: BodyCandidate[]): string[] {
  return candidates.map(citation).filter((c): c is string => c !== null);
}
