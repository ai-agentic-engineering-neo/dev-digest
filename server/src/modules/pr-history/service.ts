import type { PrHistory, PrHistoryItem } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';

/** Caps the list at the N most-overlapping prior PRs — a read-only summary, not a full log. */
const MAX_HISTORY_ITEMS = 10;

/**
 * pr-history module — "prior PRs that touched the same files as this one."
 * Deterministic and read-only: file-path set intersection over `pr_files`,
 * no LLM call, no GitHub round trip (unlike `pulls.detail`, which refreshes
 * live — this only needs what's already persisted from prior imports).
 */
export class PrHistoryService {
  constructor(private container: Container) {}

  async historyForPull(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.container.pullsRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const changedFiles = new Set((await this.container.pullsRepo.getFiles(prId)).map((f) => f.path));
    if (changedFiles.size === 0) return { history: [] };

    const otherFiles = await this.container.pullsRepo.getOtherPrFiles(pull.repoId, prId);
    const overlapByPr = new Map<string, string[]>();
    for (const { prId: otherId, path } of otherFiles) {
      if (!changedFiles.has(path)) continue;
      const arr = overlapByPr.get(otherId);
      if (arr) arr.push(path);
      else overlapByPr.set(otherId, [path]);
    }
    if (overlapByPr.size === 0) return { history: [] };

    const allPulls = await this.container.pullsRepo.listByRepo(pull.repoId);
    const pullsById = new Map(allPulls.map((p) => [p.id, p]));

    const items: PrHistoryItem[] = [];
    for (const [otherId, files] of overlapByPr) {
      const other = pullsById.get(otherId);
      if (!other) continue; // deleted between the two queries — skip, don't throw
      const mergedAt = other.updatedAt ?? other.openedAt;
      items.push({
        pr_number: other.number,
        title: other.title,
        merged_at: mergedAt ? mergedAt.toISOString() : '',
        author: other.author,
        files_overlap: files,
        notes: `Touched ${files.length} of ${changedFiles.size} changed file${changedFiles.size === 1 ? '' : 's'} in this PR.`,
      });
    }

    items.sort(
      (a, b) => b.files_overlap.length - a.files_overlap.length || b.merged_at.localeCompare(a.merged_at),
    );

    return { history: items.slice(0, MAX_HISTORY_ITEMS) };
  }
}
