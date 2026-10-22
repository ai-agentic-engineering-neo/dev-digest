import { readFile } from 'node:fs/promises';
import { join, normalize, isAbsolute } from 'node:path';
import type { RepoIntel } from '../repo-intel/types.js';
import { CONFIG_SAMPLE_PATTERNS, SOURCE_SAMPLE_COUNT } from './constants.js';

/**
 * Code-only sample selection — no model call. Config files that exist in the
 * clone plus the source files `repoIntel.getConventionSamples` picks, both
 * read straight off the local clone.
 */

export interface SampledFile {
  path: string;
  content: string;
}

export interface ConventionsSampleSet {
  configFiles: SampledFile[];
  sourceFiles: SampledFile[];
}

/**
 * Read a repo-relative file from the clone, or `null` when missing. Rejects
 * absolute / `..` paths — `path` can come from model output (evidence_path).
 */
export async function readClone(clonePath: string, path: string): Promise<string | null> {
  const rel = normalize(path);
  if (isAbsolute(rel) || rel.startsWith('..')) return null;
  return readFile(join(clonePath, rel), 'utf8').catch(() => null);
}

async function readAll(clonePath: string, paths: readonly string[]): Promise<SampledFile[]> {
  const hits = await Promise.all(
    paths.map(async (path) => {
      const content = await readClone(clonePath, path);
      return content !== null ? { path, content } : null;
    }),
  );
  return hits.filter((f): f is SampledFile => f !== null);
}

export async function getConventionsSampleSet(
  repoIntel: Pick<RepoIntel, 'getConventionSamples'>,
  repo: { id: string; clonePath: string },
): Promise<ConventionsSampleSet> {
  const sourcePaths = await repoIntel.getConventionSamples(repo.id, SOURCE_SAMPLE_COUNT);
  const [configFiles, sourceFiles] = await Promise.all([
    readAll(repo.clonePath, CONFIG_SAMPLE_PATTERNS),
    readAll(repo.clonePath, sourcePaths),
  ]);
  return { configFiles, sourceFiles };
}
