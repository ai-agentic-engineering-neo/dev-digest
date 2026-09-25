/**
 * smart-diff use case (server/specs/06-smart-diff.md): group a PR's files by
 * role and attach the finding lines of each agent's newest review. No model call.
 */
import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../../platform/errors.js';
import { buildSmartDiff } from '../domain/smart-diff.js';
import type { SmartDiffSource } from './ports.js';

export interface SmartDiffServiceDeps {
  source: SmartDiffSource;
}

export class SmartDiffService {
  constructor(private readonly deps: SmartDiffServiceDeps) {}

  /** GET /pulls/:id/smart-diff. */
  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const exists = await this.deps.source.pullExists(workspaceId, prId);
    if (!exists) throw new NotFoundError('Pull request not found');
    const [files, findings] = await Promise.all([
      this.deps.source.listFiles(prId),
      this.deps.source.latestReviewFindings(prId),
    ]);
    return buildSmartDiff(files, findings);
  }
}
