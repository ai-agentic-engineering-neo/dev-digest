import type { UnifiedDiff } from '@devdigest/shared';
import type { DiffParser, DiffSource, PullAccess, RepoRef, ReviewPull } from './ports.js';

export interface DiffLoaderDeps {
  git: DiffSource;
  pulls: PullAccess;
  parseDiff: DiffParser;
}

/** Where the loader reports what it did; the run executor passes the run log. */
export interface DiffNotes {
  info(msg: string): void;
}

export interface LoadedDiff {
  diff: UnifiedDiff;
  /** Files GitHub gave no patch for (binary / too large): not in `diff`. */
  skippedFiles: number;
}

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 * The fallback and any file skipped for lack of a patch are noted in the log.
 */
export async function loadDiff(
  deps: DiffLoaderDeps,
  pull: ReviewPull,
  repo: RepoRef,
  notes?: DiffNotes,
): Promise<LoadedDiff> {
  try {
    const diff = await deps.git.diff({ owner: repo.owner, name: repo.name }, pull.base, pull.headSha);
    if (diff.files.length > 0) return { diff, skippedFiles: 0 };
    notes?.info('git diff was empty; falling back to the stored PR files');
  } catch (err) {
    notes?.info(`git diff failed (${(err as Error).message}); falling back to the stored PR files`);
  }
  const loaded = await diffFromPrFiles(deps, pull.id);
  if (loaded.skippedFiles > 0) {
    notes?.info(`${loaded.skippedFiles} file(s) have no patch (binary or too large) and are not reviewed`);
  }
  return loaded;
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(
  deps: Pick<DiffLoaderDeps, 'pulls' | 'parseDiff'>,
  prId: string,
): Promise<LoadedDiff> {
  const { files } = await deps.pulls.filesAndCommits(prId);
  const parts: string[] = [];
  let skippedFiles = 0;
  for (const f of files) {
    if (!f.patch) {
      skippedFiles++;
      continue;
    }
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return { diff: deps.parseDiff(parts.join('\n')), skippedFiles };
}
