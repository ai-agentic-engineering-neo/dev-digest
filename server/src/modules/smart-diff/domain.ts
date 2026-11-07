/** Smart Diff domain — pure types and rules, no runtime imports. */

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface FindingAnchor {
  file: string;
  startLine: number;
}

export interface ReviewWithFindings {
  review: { id: string; agentId: string | null; kind: 'summary' | 'review'; createdAt: Date };
  findings: { file: string; startLine: number; dismissedAt: Date | null }[];
}

/** True when `a` is a newer review than `b` (createdAt desc, then id desc). */
function isNewer(a: ReviewWithFindings['review'], b: ReviewWithFindings['review']): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  if (diff !== 0) return diff > 0;
  return a.id > b.id;
}

/**
 * Per agentId (null = one bucket) the newest kind='review' row; its findings
 * with dismissedAt === null, merged. No review → [].
 */
export function latestReviewFindings(rows: readonly ReviewWithFindings[]): FindingAnchor[] {
  const latest = new Map<string | null, ReviewWithFindings>();
  for (const row of rows) {
    if (row.review.kind !== 'review') continue;
    const current = latest.get(row.review.agentId);
    if (!current || isNewer(row.review, current.review)) latest.set(row.review.agentId, row);
  }
  const out: FindingAnchor[] = [];
  for (const row of latest.values()) {
    for (const f of row.findings) {
      if (f.dismissedAt === null) out.push({ file: f.file, startLine: f.startLine });
    }
  }
  return out;
}
