import type { PrFindingPreview } from '@devdigest/shared';

export interface ReviewRow {
  id: string;
  prId: string;
  agentId: string | null;
  createdAt: Date;
}

export interface FindingRow {
  id: string;
  reviewId: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
  kind: string;
  dismissedAt: Date | null;
}

const RATIONALE_MAX = 240;

/** Review ids that make up each PR's CURRENT review: the newest `review` per agent. */
export function currentReviewIds(rows: ReviewRow[]): string[] {
  const latest = new Map<string, ReviewRow>(); // key: prId + agentId
  for (const r of rows) {
    const key = `${r.prId}:${r.agentId ?? ''}`;
    const prev = latest.get(key);
    if (!prev || r.createdAt > prev.createdAt) latest.set(key, r);
  }
  return [...latest.values()].map((r) => r.id);
}

/**
 * Open findings per PR, from the PR's current review (newest per agent). Dismissed
 * findings and non-`finding` kinds (e.g. lethal-trifecta summaries) are skipped;
 * rationale is truncated to keep the list payload small.
 */
export function aggregatePrFindings(
  reviews: ReviewRow[],
  findings: FindingRow[],
): Map<string, PrFindingPreview[]> {
  const current = new Set(currentReviewIds(reviews));
  const prByReview = new Map(reviews.map((r) => [r.id, r.prId]));
  const out = new Map<string, PrFindingPreview[]>();
  for (const f of findings) {
    if (!current.has(f.reviewId) || f.dismissedAt || f.kind !== 'finding') continue;
    const prId = prByReview.get(f.reviewId);
    if (!prId) continue;
    const list = out.get(prId) ?? [];
    list.push({
      id: f.id,
      severity: f.severity as PrFindingPreview['severity'],
      category: f.category as PrFindingPreview['category'],
      title: f.title,
      file: f.file,
      start_line: f.startLine,
      end_line: f.endLine,
      confidence: f.confidence,
      rationale:
        f.rationale.length > RATIONALE_MAX ? `${f.rationale.slice(0, RATIONALE_MAX - 1)}…` : f.rationale,
    });
    out.set(prId, list);
  }
  return out;
}
