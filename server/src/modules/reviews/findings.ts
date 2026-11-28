import type { FindingActionKind, FindingRecord } from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import type { ReviewStore } from './ports.js';

/**
 * Finding actions available in the starter: accept / dismiss. These decisions
 * are the dataset later milestones build on (eval cases from accept/dismiss, the
 * `learn → memory` action, etc.).
 */
export async function actOnFinding(
  store: Pick<ReviewStore, 'findingWorkspace' | 'setFindingAccepted' | 'setFindingDismissed'>,
  workspaceId: string,
  findingId: string,
  action: FindingActionKind,
): Promise<{ finding: FindingRecord }> {
  if ((await store.findingWorkspace(findingId)) !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }

  switch (action) {
    case 'accept': {
      const finding = await store.setFindingAccepted(findingId, new Date());
      return { finding: finding! };
    }
    case 'dismiss': {
      const finding = await store.setFindingDismissed(findingId, new Date());
      return { finding: finding! };
    }
    default:
      throw new BadRequestError('invalid_action', `Action '${action}' is not available in the starter`);
  }
}
