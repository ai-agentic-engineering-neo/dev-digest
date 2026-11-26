import type { UnifiedDiff } from '@devdigest/shared';
import type { DiffParser, DiffSource, PullAccess, RepoRef, ReviewPull } from './ports.js';

export interface DiffLoaderDeps {
  git: DiffSource;
  pulls: PullAccess;
  parseDiff: DiffParser;
}

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  deps: DiffLoaderDeps,
  pull: ReviewPull,
  repo: RepoRef,
): Promise<UnifiedDiff> {
  try {
    const diff = await deps.git.diff({ owner: repo.owner, name: repo.name }, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return diffFromPrFiles(deps, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(
  deps: Pick<DiffLoaderDeps, 'pulls' | 'parseDiff'>,
  prId: string,
): Promise<UnifiedDiff> {
  const { files } = await deps.pulls.filesAndCommits(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return deps.parseDiff(parts.join('\n'));
}
