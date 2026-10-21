/** smart-diff ports (ring 1): plain DTOs and the repository contract. */

export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingRef {
  id: string;
  file: string;
  startLine: number;
  dismissed: boolean;
}

export interface SmartDiffInputs {
  files: SmartDiffSourceFile[];
  /** Findings of the latest review per agent. */
  findings: SmartDiffFindingRef[];
  hasReview: boolean;
}

export interface SmartDiffRepositoryPort {
  /** undefined = the PR does not exist in this workspace. */
  getInputs(workspaceId: string, prId: string): Promise<SmartDiffInputs | undefined>;
}

export interface SmartDiffDeps {
  repo: SmartDiffRepositoryPort;
}
