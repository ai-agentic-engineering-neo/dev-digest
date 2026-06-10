/**
 * repo-intel pipeline — `runIncremental` (plan §9.3).
 *
 * Cheap path the polling/refresh hook takes. Flow:
 *   1. No state row OR indexer-version mismatch → delegate to runFullIndex.
 *   2. `currentSha === lastIndexedSha`            → touch updated_at, exit.
 *   3. `git diff --name-only base..head` ∩ SUPPORTED_EXT
 *        - 0 files → bump lastIndexedSha, exit (code didn't move in a parsed ext).
 *        - >INCREMENTAL_FULL_THRESHOLD → delegate to runFullIndex (cheaper than the slice).
 *      Else: delete the slice's rows + reparse + persist.
 *
 * EXCLUDED IN T2.2 (→ T3): rank recompute, graph delta, repo-map invalidation.
 * The decl_file column stays NULL on every newly-written row (no resolver yet).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { withTimeout } from '../../../platform/resilience.js';
import { parseSymbols, parseReferences, langForFile } from '../../../adapters/astgrep/index.js';
import {
  INDEXER_VERSION,
  MAX_PARSE_MS_PER_FILE,
  SUPPORTED_EXT,
} from '../constants.js';
import type {
  IndexerReferenceRow,
  IndexerSymbolRow,
  RepoIntelRepository,
} from '../repository.js';
import type { IndexResult } from '../types.js';
import { runFullIndex, type IndexPayload } from './full.js';

/**
 * Threshold above which incremental becomes more expensive than full-index.
 * Tuned against plan §9.3 step 4. Held local here (not in constants.ts) so
 * the heuristic can move without churning the public constants module.
 */
const INCREMENTAL_FULL_THRESHOLD = 300;

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export async function runIncremental(
  container: Container,
  repository: RepoIntelRepository,
  payload: IndexPayload,
): Promise<IndexResult> {
  const startedAt = Date.now();
  const repoId = payload.repoId;

  const repo = await repository.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) {
    // No clone yet → nothing to refresh against. The next CLONE job will
    // enqueue a full index; we don't try to fake one here.
    return {
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason: 'no_clone',
    };
  }

  const state = await repository.tryGetIndexState(repoId);

  // (1) No state row OR indexer-version mismatch → full reindex. The version
  //     bumps whenever the parser/schema changes shape; mixing rows from two
  //     versions would corrupt downstream consumers (plan §9.3 step 1).
  if (!state || state.indexerVersion !== INDEXER_VERSION) {
    return runFullIndex(container, repository, payload);
  }

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  let currentSha: string;
  try {
    currentSha = await container.git.currentHead(ref);
  } catch (err) {
    return {
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason: `git_head_failed:${asMessage(err)}`,
    };
  }

  // (2) Sha unchanged → just touch updated_at so observers see liveness.
  if (currentSha === state.lastIndexedSha) {
    await repository.touchIndexState(repoId);
    return {
      status: state.status,
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      durationMs: Date.now() - startedAt,
      reason: 'sha_unchanged',
    };
  }

  // (3) Compute changed-file intersection.
  let changedAll: string[];
  try {
    changedAll = await container.git.diffNameOnly(ref, state.lastIndexedSha, currentSha);
  } catch (err) {
    // diff failure (shallow clone, missing base, etc.) — fall back to full.
    // The full path is heavier but correct; degrading silently to "no-op" would
    // leave the index drifted from HEAD.
    return runFullIndex(container, repository, payload);
  }
  const changed = changedAll.filter((p) => SUPPORTED_SET.has(extname(p).toLowerCase()));

  if (changed.length === 0) {
    // Code didn't move in a parsed extension — just bump the sha so the next
    // diff baseline is current.
    await repository.advanceSha(repoId, currentSha);
    return {
      status: state.status,
      filesIndexed: state.filesIndexed,
      filesSkipped: state.filesSkipped,
      durationMs: Date.now() - startedAt,
      reason: 'no_supported_changes',
    };
  }

  // (4) Large diff → cheaper to redo a full index than to slice.
  if (changed.length > INCREMENTAL_FULL_THRESHOLD) {
    return runFullIndex(container, repository, payload);
  }

  // (5) Slice path: delete then reparse the changed files.
  const symbolsBuf: IndexerSymbolRow[] = [];
  const refsBuf: IndexerReferenceRow[] = [];
  let filesIndexed = 0;
  let filesSkipped = 0;
  const parseDegraded: Array<{ file: string; reason: string }> = [];

  for (const relPath of changed) {
    const lang = langForFile(relPath);
    if (!lang) {
      filesSkipped += 1;
      continue;
    }
    let source: string;
    try {
      source = await readFile(join(repo.clonePath, relPath), 'utf8');
    } catch (err) {
      // File was deleted between the diff and the read — count as skipped
      // (its old rows still get cleared below).
      filesSkipped += 1;
      parseDegraded.push({ file: relPath, reason: asMessage(err) });
      continue;
    }
    const contentHash = sha1(source);
    try {
      const parsed = await withTimeout(
        Promise.resolve().then(() => ({
          symbols: parseSymbols(relPath, source),
          references: parseReferences(relPath, source),
        })),
        MAX_PARSE_MS_PER_FILE,
      );
      for (const s of parsed.symbols) {
        symbolsBuf.push({
          repoId,
          path: relPath,
          name: s.name,
          kind: s.kind,
          line: s.line,
          endLine: s.endLine,
          exported: s.exported,
          signature: s.signature,
          contentHash,
        });
      }
      for (const r of parsed.references) {
        refsBuf.push({
          repoId,
          fromPath: relPath,
          toSymbol: r.toSymbol,
          line: r.line,
          contentHash,
        });
      }
      filesIndexed += 1;
    } catch (err) {
      filesSkipped += 1;
      parseDegraded.push({ file: relPath, reason: asMessage(err) });
    }
  }

  await repository.deleteForFiles(repoId, changed);
  await repository.insertSymbols(symbolsBuf);
  await repository.insertReferences(refsBuf);

  // TODO(T3): re-resolve `decl_file` for references touching the changed
  // file set; recompute file_rank; invalidate repo_map_cache.
  const stats: Record<string, unknown> = {
    incremental: true,
    changedFiles: changed.length,
    symbolsWritten: symbolsBuf.length,
    referencesWritten: refsBuf.length,
    parseDegraded,
    durationMs: Date.now() - startedAt,
  };

  // The aggregate filesIndexed counter on `repo_index_state` is the prior
  // count + this slice. Symbols/references for unchanged files are still in
  // the table, so the counter must reflect total coverage.
  const newFilesIndexed = state.filesIndexed + filesIndexed;
  const newFilesSkipped = state.filesSkipped + filesSkipped;

  await repository.upsertIndexState({
    repoId,
    lastIndexedSha: currentSha,
    indexerVersion: INDEXER_VERSION,
    status: 'partial', // remains 'partial' until T3 promotes it.
    filesIndexed: newFilesIndexed,
    filesSkipped: newFilesSkipped,
    stats,
  });

  return {
    status: 'partial',
    filesIndexed,
    filesSkipped,
    durationMs: Date.now() - startedAt,
    reason: 'incremental',
  };
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
