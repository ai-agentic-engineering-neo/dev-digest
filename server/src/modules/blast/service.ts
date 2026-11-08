import { NotFoundError } from '../../platform/errors.js';
import { buildBlastRadius, EMPTY_BLAST_RESULT } from './domain/build.js';
import { deriveBlastStatus } from './domain/status.js';
import { MAX_PRIOR_PULLS, type PrBlastRadius, type PriorPullsResponse } from './domain/types.js';
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

  /** Earlier PRs of the same repo touching this PR's files (history context; no LLM, no GitHub). */
  async priorPulls(workspaceId: string, prId: string): Promise<PriorPullsResponse> {
    const pull = await this.deps.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const { total, rows } = await this.deps.blastRepo.listPriorPulls(workspaceId, pull.id, MAX_PRIOR_PULLS);
    return {
      pr_id: pull.id,
      total,
      pulls: rows.map((r) => ({
        pr_id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        status: r.status,
        updated_at: r.updatedAt ? r.updatedAt.toISOString() : null,
        shared_count: r.sharedCount,
        shared_files: r.sharedFiles,
      })),
    };
  }
}
