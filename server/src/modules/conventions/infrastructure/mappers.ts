/** Row → contract mappers (timestamps become ISO strings for the response schemas). */
import type { Convention, ConventionDropReason, ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../../db/rows.js';

export function toConventionDto(row: ConventionRow): Convention {
  return {
    id: row.id,
    repo_id: row.repoId,
    scan_id: row.scanId,
    category: row.category,
    rule: row.rule,
    evidence: row.evidence,
    confidence: row.confidence ?? 0,
    status: row.status,
    edited: row.edited,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toConventionScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    sampled_files: row.sampledFiles,
    proposed: row.proposed,
    kept: row.kept,
    dropped: row.dropped.map((d) => ({ ...d, reason: d.reason as ConventionDropReason })),
    model: row.model,
    cost_usd: row.costUsd,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}
