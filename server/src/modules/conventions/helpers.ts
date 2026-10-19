import type { ConventionCandidate, ConventionScan } from '@devdigest/shared';
import type { ConventionRecord, ScanRecord } from './ports.js';

/** Pure DTO mappers for the conventions module. */

export function toConventionDto(r: ConventionRecord): ConventionCandidate {
  return {
    id: r.id,
    category: r.category,
    rule: r.rule,
    evidence_path: r.evidencePath,
    evidence_line: r.evidenceLine,
    evidence_snippet: r.evidenceSnippet,
    confidence: r.confidence,
    status: r.status,
  };
}

export function toScanDto(r: ScanRecord): ConventionScan {
  return {
    id: r.id,
    status: r.status,
    files_sampled: r.filesSampled,
    error: r.error,
    started_at: r.startedAt.toISOString(),
    finished_at: r.finishedAt?.toISOString() ?? null,
  };
}
