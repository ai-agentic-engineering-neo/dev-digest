import type { UnifiedDiff } from '@devdigest/shared';
import type { RunLogger } from '../../../platform/run-logger.js';
import { CALLERS_LIMIT } from '../domain/constants.js';
import { callersDigest, hotFiles, rankNote } from '../domain/prompt.js';
import type { RepoContext } from './ports.js';

/** Repo-intel sections of a review prompt; each omitted when it adds nothing. */
export interface PromptContext {
  callers?: string;
  repoMap?: string;
  /** Appended to the task line; '' when no changed file is hot. */
  rankNote: string;
}

/**
 * Gather the repo-intel enrichment for a review prompt: callers of changed
 * symbols (T1.3), the repo skeleton and the hot-file note (T3). Best-effort —
 * a repo-intel failure is only a Live Log line, never a failed run; when the
 * facade degrades (flag off / unindexed) the prompt equals the diff-only one.
 */
export async function gatherPromptContext(
  repoIntel: RepoContext,
  repoId: string,
  diff: UnifiedDiff,
  runLog: RunLogger,
): Promise<PromptContext> {
  const changed = diff.files.map((f) => f.path);
  const callers = await callersSection(repoIntel, repoId, changed, runLog);
  const repoMap = await repoMapSection(repoIntel, repoId, runLog);
  const note = await rankSection(repoIntel, repoId, changed, runLog);
  return { ...(callers ? { callers } : {}), ...(repoMap ? { repoMap } : {}), rankNote: note };
}

async function callersSection(
  repoIntel: RepoContext,
  repoId: string,
  changed: string[],
  runLog: RunLogger,
): Promise<string | undefined> {
  if (changed.length === 0) return undefined;
  try {
    const rows = await repoIntel.getCallerSignatures(repoId, changed, CALLERS_LIMIT);
    const digest = callersDigest(rows);
    if (digest) runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return digest;
  } catch (err) {
    runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
    return undefined;
  }
}

async function repoMapSection(
  repoIntel: RepoContext,
  repoId: string,
  runLog: RunLogger,
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

async function rankSection(
  repoIntel: RepoContext,
  repoId: string,
  changed: string[],
  runLog: RunLogger,
): Promise<string> {
  if (changed.length === 0) return '';
  try {
    const hot = hotFiles(await repoIntel.getFileRank(repoId, changed));
    if (hot.length > 0) runLog.info(`file rank: ${hot.length}/${changed.length} changed file(s) in top 5%`);
    return rankNote(hot.length, changed.length);
  } catch {
    return '';
  }
}
