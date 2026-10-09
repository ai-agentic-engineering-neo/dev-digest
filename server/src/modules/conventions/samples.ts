import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import { CONFIG_SAMPLE_PATTERNS, SOURCE_SAMPLE_COUNT } from './constants.js';

/**
 * Code-only sample selection for the Conventions Extractor — no model call.
 * Config files (eslint/prettier/tsconfig) plus the top-ranked source files
 * `repoIntel.getConventionSamples` already knows how to pick; both are read
 * straight off the local clone.
 */

export interface SampledFile {
  path: string;
  content: string;
}

export interface ConventionsSampleSet {
  configFiles: SampledFile[];
  sourceFiles: SampledFile[];
  sourceSha: string;
}

/** Same 2-line pattern `repo-intel/service.ts` keeps private — duplicated
 *  here rather than exported across a module boundary for one helper.
 *  Exported for reuse within this module (evidence verification also reads
 *  off the clone, for candidates that cite a file outside the sample set). */
export async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

export async function getConventionsSampleSet(
  container: Container,
  repo: { id: string; owner: string; name: string; clonePath: string | null },
): Promise<ConventionsSampleSet> {
  if (!repo.clonePath) {
    throw new ValidationError(
      'Repo has not been cloned yet — refresh it before extracting conventions',
    );
  }
  const clonePath = repo.clonePath;

  const configHits = await Promise.all(
    CONFIG_SAMPLE_PATTERNS.map(async (path) => {
      const content = await readClone(clonePath, path);
      return content !== null ? { path, content } : null;
    }),
  );
  const configFiles = configHits.filter((f): f is SampledFile => f !== null);

  const sourcePaths = await container.repoIntel.getConventionSamples(repo.id, SOURCE_SAMPLE_COUNT);
  const sourceHits = await Promise.all(
    sourcePaths.map(async (path) => {
      const content = await readClone(clonePath, path);
      return content !== null ? { path, content } : null;
    }),
  );
  const sourceFiles = sourceHits.filter((f): f is SampledFile => f !== null);

  const sourceSha = await container.git.currentHead({ owner: repo.owner, name: repo.name });

  return { configFiles, sourceFiles, sourceSha };
}
