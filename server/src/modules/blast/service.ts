import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from './helpers.js';

/**
 * blast module — the only feature-side consumer of
 * `repoIntel.getBlastRadius()`. Deterministic and read-only, computed on
 * demand from the PR's changed files: no LLM call, no persisted table, no
 * GitHub round trip. Same shape as `reviews/smart-diff-service.ts`.
 */
export class BlastService {
  constructor(private container: Container) {}

  async blastForPull(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(prId);
    const changedFiles = files.map((f) => f.path);

    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    return toBlastRadius(result);
  }
}
