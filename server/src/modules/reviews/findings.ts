import type { FindingActionKind } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { FindingRow, ReviewRepository } from './repository.js';
import { findingRowToDto, type ReviewDtoFinding } from './helpers.js';

/**
 * specs/13-multi-agent-review.md (D24, D-P5) — assemble the Learn memory
 * entry's content DETERMINISTICALLY from the finding's own persisted fields.
 * No LLM call, no summarisation (AC-63, AC-64).
 */
function buildLearningContent(finding: FindingRow): string {
  const range =
    finding.startLine === finding.endLine ? `line ${finding.startLine}` : `lines ${finding.startLine}-${finding.endLine}`;
  return `${finding.title} (${finding.file}, ${range}): ${finding.rationale}`;
}

/**
 * Finding actions available in the starter: accept / dismiss / learn. These
 * decisions are the dataset later lessons build on (eval cases from
 * accept/dismiss, the `learn → memory` action, etc.).
 */
export async function actOnFinding(
  repo: ReviewRepository,
  workspaceId: string,
  findingId: string,
  action: FindingActionKind,
): Promise<{ finding: ReviewDtoFinding; memoryId?: string }> {
  const ctx = await repo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }

  switch (action) {
    case 'accept': {
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'dismiss': {
      const row = await repo.setFindingDismissed(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'learn': {
      // Idempotency guard (D24's "double-click writes two rows" edge case):
      // reuse the existing memory row rather than writing a second one.
      const existing = await repo.findLearningForFinding(workspaceId, findingId);
      if (existing) {
        return { finding: findingRowToDto(ctx.finding), memoryId: existing.id };
      }
      const memory = await repo.insertLearningFromFinding({
        workspaceId,
        repoId: ctx.pull.repoId,
        content: buildLearningContent(ctx.finding),
        sources: {
          finding_id: ctx.finding.id,
          review_id: ctx.review.id,
          run_id: ctx.review.runId,
          agent_id: ctx.review.agentId,
        },
      });
      return { finding: findingRowToDto(ctx.finding), memoryId: memory.id };
    }
    default:
      throw new AppError('invalid_action', `Action '${action}' is not available in the starter`, 400);
  }
}
