import type { Container } from '../../platform/container.js';
import type { SmartDiff, SmartDiffFile, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { SMART_DIFF_ROLES, SPLIT_TOO_BIG_FILES, SPLIT_TOO_BIG_LINES } from './constants.js';
import { classifyFile } from './helpers.js';

/**
 * Group changed files into core / wiring / boilerplate by heuristics, annotate
 * with finding-lines from persisted findings, and suggest a split when the PR
 * is too big (§7 split nudger). No LLM call required (deterministic, cheap).
 */
export async function smartDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  prId: string,
): Promise<SmartDiff> {
  const pull = await repo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');
  const files = await repo.getPrFiles(prId);

  // T3: import-graph rank percentile per changed file. Confirms a 'core'
  // verdict (percentile ≥ 80) and demotes weakly-ranked files to 'wiring'.
  // Best-effort: flag off / unindexed → empty map → classifyFile verdict kept.
  let pctByPath = new Map<string, number>();
  try {
    const ranks = await container.repoIntel.getFileRank(
      pull.repoId,
      files.map((f) => f.path),
    );
    pctByPath = new Map(ranks.map((r) => [r.path, r.percentile]));
  } catch {
    /* degrade — keep the heuristic verdicts */
  }

  // finding-lines per file (from the latest reviews)
  const reviews = await repo.reviewsForPull(prId);
  const findingLinesByFile = new Map<string, Set<number>>();
  for (const { findings } of reviews) {
    for (const f of findings) {
      const set = findingLinesByFile.get(f.file) ?? new Set<number>();
      for (let n = f.startLine; n <= f.endLine; n++) set.add(n);
      findingLinesByFile.set(f.file, set);
    }
  }

  const groups: Record<'core' | 'wiring' | 'boilerplate', SmartDiffFile[]> = {
    core: [],
    wiring: [],
    boilerplate: [],
  };
  let totalLines = 0;
  for (const f of files) {
    const additions = f.additions ?? 0;
    const deletions = f.deletions ?? 0;
    totalLines += additions + deletions;
    let role = classifyFile(f.path);
    if (role === 'core') {
      const pct = pctByPath.get(f.path);
      if (pct !== undefined && pct < 80) role = 'wiring';
    }
    const findingLines = [...(findingLinesByFile.get(f.path) ?? [])].sort((a, b) => a - b);
    groups[role].push({
      path: f.path,
      pseudocode_summary: null,
      additions,
      deletions,
      finding_lines: findingLines,
    });
  }

  const tooBig = totalLines > SPLIT_TOO_BIG_LINES || files.length > SPLIT_TOO_BIG_FILES;
  const proposed = tooBig
    ? SMART_DIFF_ROLES.filter((role) => groups[role].length > 0).map((role) => ({
        name: `${role} changes`,
        files: groups[role].map((g) => g.path),
      }))
    : [];

  return {
    groups: SMART_DIFF_ROLES.filter((role) => groups[role].length > 0).map((role) => ({
      role,
      files: groups[role],
    })),
    split_suggestion: { too_big: tooBig, total_lines: totalLines, proposed_splits: proposed },
  };
}

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  try {
    const diff = await container.git.diff(
      { owner: repoRow.owner, name: repoRow.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return diffFromPrFiles(repo, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
