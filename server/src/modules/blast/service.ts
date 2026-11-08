import { NotFoundError } from '../../platform/errors.js';
import { buildBlastRadius, EMPTY_BLAST_RESULT } from './domain/build.js';
import { deriveBlastStatus } from './domain/status.js';
import type { PrBlastRadius } from './domain/types.js';
import type { BlastIntelPort, BlastPullSource, BlastRepositoryPort } from './ports.js';

export interface BlastDeps {
  reviewRepo: BlastPullSource;
  blastRepo: BlastRepositoryPort;
  repoIntel: BlastIntelPort;
  config: { repoIntelEnabled: boolean };
}

export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  /** Blast radius of a PR from the existing repo-intel index (no LLM, no GitHub). */
  async forPull(workspaceId: string, prId: string): Promise<PrBlastRadius> {
    // repoId comes only from the workspace-checked PR, never from the request.
    const pull = await this.deps.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [paths, index] = await Promise.all([
      this.deps.blastRepo.listChangedPaths(workspaceId, prId),
      this.deps.repoIntel.getIndexState(pull.repoId),
    ]);
    const result = paths.length
      ? await this.deps.repoIntel.getBlastRadius(pull.repoId, paths)
      : EMPTY_BLAST_RESULT;
    const status = deriveBlastStatus({
      repoIntelEnabled: this.deps.config.repoIntelEnabled,
      index,
      result,
    });
    return buildBlastRadius({ prId: pull.id, headSha: pull.headSha, index, result, status });
  }
}
