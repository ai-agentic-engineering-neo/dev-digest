import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PinoLike as Logger } from '../../platform/run-logger.js';
import { NotFoundError } from '../../platform/errors.js';
import type { RepoIntel } from '../repo-intel/types.js';
import { BlastRepository, type BlastRepo } from './repository.js';
import { toBlastRadiusResponse } from './helpers.js';

export interface BlastDeps {
  repo: BlastRepo;
  repoIntel: RepoIntel;
}

/**
 * blast service. One use case: resolve the PR (workspace-scoped), then a single
 * repo-intel facade call over the PR's changed paths, mapped to the contract.
 * Depends on the `RepoIntel` interface, never the concrete service.
 */
export class BlastService {
  constructor(private deps: BlastDeps) {}

  /** Default wiring from the container; tests construct with fakes directly. */
  static fromContainer(container: Pick<Container, 'db' | 'repoIntel'>): BlastService {
    return new BlastService({
      repo: new BlastRepository(container.db),
      repoIntel: container.repoIntel,
    });
  }

  async getBlast(workspaceId: string, prId: string, logger?: Logger): Promise<BlastRadiusResponse> {
    const scope = await this.deps.repo.getPullScope(workspaceId, prId);
    if (!scope) throw new NotFoundError('Pull request not found');
    const paths = await this.deps.repo.getChangedPaths(prId);
    const startedAt = Date.now();
    const result = await this.deps.repoIntel.getBlastRadius(scope.repoId, paths);
    const response = toBlastRadiusResponse(result);
    // Read-only over the precomputed index: nothing is parsed or rebuilt here.
    // When the facade degrades it falls back to ripgrep instead, and says so.
    logger?.info(
      {
        prId,
        repoId: scope.repoId,
        changedFiles: paths.length,
        symbols: response.changed_symbols.length,
        groups: response.downstream.length,
        endpoints: response.impacted_endpoints.length,
        degraded: response.degraded,
        reason: response.reason,
        source: response.degraded ? 'ripgrep-fallback' : 'repo-intel-index',
        ms: Date.now() - startedAt,
      },
      'blast radius served',
    );
    return response;
  }
}
