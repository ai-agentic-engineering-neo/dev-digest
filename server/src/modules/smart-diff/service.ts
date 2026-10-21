import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './helpers.js';
import type { SmartDiffDeps } from './ports.js';

export class SmartDiffService {
  constructor(private readonly deps: SmartDiffDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const inputs = await this.deps.repo.getInputs(workspaceId, prId);
    if (!inputs) throw new NotFoundError('Pull request not found');
    return buildSmartDiff(inputs);
  }
}
