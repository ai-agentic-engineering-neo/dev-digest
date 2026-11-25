import type { UnifiedDiff } from '@devdigest/shared';
import type { ReviewContextSource, RunLog } from '../domain/ports.js';

/**
 * Repo-intel prompt-context builders for a review run. All best-effort: any
 * repo-intel failure degrades to "no section" and never breaks the run.
 */

/**
 * Build a compact "Callers of changed symbols" digest for the prompt.
 *
 * Returns `undefined` when nothing should be added (flag off, no callers
 * found, or repo-intel errors) — `reviewPullRequest` omits the section in
 * that case (acceptance #10: flag off → identical prompt).
 *
 * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
 * rows per `getCallerSignatures` call) so the section stays under ~600
 * tokens even on heavy PRs.
 */
export async function buildCallersDigest(
  repoIntel: ReviewContextSource,
  repoId: string,
  diff: UnifiedDiff,
  runLog: RunLog,
): Promise<string | undefined> {
  const changedFiles = diff.files.map((f) => f.path);
  if (changedFiles.length === 0) return undefined;
  let rows;
  try {
    rows = await repoIntel.getCallerSignatures(repoId, changedFiles, 10);
  } catch (err) {
    // Never let an enrichment break the run — surface only as a Live Log info.
    runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
    return undefined;
  }
  if (rows.length === 0) return undefined;

  const byFile = new Map<string, string[]>();
  for (const r of rows) {
    const lines = byFile.get(r.file) ?? [];
    lines.push(`- \`${r.symbol}\` — ${r.signature}`);
    byFile.set(r.file, lines);
  }
  const out: string[] = [];
  for (const [file, lines] of byFile) {
    out.push(`### ${file}`);
    out.push(...lines);
  }
  runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
  return out.join('\n');
}

/**
 * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
 * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
 * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
 */
export async function buildRepoMapDigest(
  repoIntel: ReviewContextSource,
  repoId: string,
  runLog: RunLog,
): Promise<string | undefined> {
  try {
    const map = await repoIntel.getRepoMap(repoId);
    if (map.degraded || map.text.trim().length === 0) return undefined;
    runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
    return map.text;
  } catch (err) {
    runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
 * note appended to the task framing, so the model prioritises hot core files.
 * Empty string when repo-intel is off / no changed file is hot.
 */
export async function buildRankNote(
  repoIntel: ReviewContextSource,
  repoId: string,
  diff: UnifiedDiff,
  runLog: RunLog,
): Promise<string> {
  const changedFiles = diff.files.map((f) => f.path);
  if (changedFiles.length === 0) return '';
  try {
    const ranks = await repoIntel.getFileRank(repoId, changedFiles);
    if (ranks.length === 0) return '';
    const hot = ranks.filter((r) => r.percentile >= 95);
    if (hot.length === 0) return '';
    runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
    return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
  } catch {
    return '';
  }
}
