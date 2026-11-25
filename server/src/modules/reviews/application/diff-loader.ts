import type { GitClient, UnifiedDiff } from '@devdigest/shared';
import type { DiffParser, ReviewsRepository } from '../domain/ports.js';
import type { PullRequest, RepoCoordinates } from '../domain/types.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  git: Pick<GitClient, 'diff'>,
  repo: ReviewsRepository,
  parseDiff: DiffParser,
  pull: PullRequest,
  coords: RepoCoordinates,
): Promise<UnifiedDiff> {
  try {
    const diff = await git.diff(
      { owner: coords.owner, name: coords.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return diffFromPrFiles(repo, parseDiff, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(
  repo: ReviewsRepository,
  parseDiff: DiffParser,
  prId: string,
): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseDiff(parts.join('\n'));
}
