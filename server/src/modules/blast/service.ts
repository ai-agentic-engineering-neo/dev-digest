import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { HISTORY_LIMIT } from './constants.js';
import { toBlastRadius, toHistory } from './helpers.js';
import type { BlastDeps } from './ports.js';

export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  /** The PR's blast radius from the repo index plus the prior PRs on the same files. No model call. */
  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const inputs = await this.deps.repo.getInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');

    const [result, prior] = await Promise.all([
      this.deps.intel.getBlastRadius(inputs.repoId, inputs.changedPaths),
      this.deps.repo.getPriorPulls(workspaceId, inputs.repoId, prId, inputs.changedPaths, HISTORY_LIMIT),
    ]);

    const degraded = result.degraded === true;
    return {
      ...toBlastRadius(result),
      degraded,
      reason: degraded ? (result.reason ?? 'no_data') : null,
      head_sha: inputs.headSha,
      history: toHistory(prior),
    };
  }
}
