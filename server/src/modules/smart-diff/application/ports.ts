/**
 * Ports of the smart-diff use case. Infrastructure implements them
 * (infrastructure/repository.ts); the composition root wires the real one and
 * tests pass an in-memory fake.
 */
import type { SmartDiffFileInput, SmartDiffFindingInput } from '../domain/smart-diff.js';

export interface SmartDiffSource {
  /** Workspace-scoped existence check — a PR from another workspace is a 404. */
  pullExists(workspaceId: string, prId: string): Promise<boolean>;
  listFiles(prId: string): Promise<SmartDiffFileInput[]>;
  /** start_line of every finding (dismissed too) on the newest review of this PR; [] when there is no review. */
  latestReviewFindings(prId: string): Promise<SmartDiffFindingInput[]>;
}
