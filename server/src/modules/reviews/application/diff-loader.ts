import type { UnifiedDiff } from '@devdigest/shared';
import type { ReviewPull, ReviewRepo } from '../domain/types.js';
import type { DiffSource, ReviewStore } from './ports.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to the diff rebuilt from the persisted pr_files patches (so the reviewer
 * works even before a clone completes / in tests).
 */
export async function loadDiff(
  deps: { git: DiffSource; reviews: Pick<ReviewStore, 'storedDiff'> },
  pull: Pick<ReviewPull, 'id' | 'base' | 'headSha'>,
  repo: Pick<ReviewRepo, 'owner' | 'name'>,
): Promise<UnifiedDiff> {
  try {
    const diff = await deps.git.diff({ owner: repo.owner, name: repo.name }, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return deps.reviews.storedDiff(pull.id);
}
