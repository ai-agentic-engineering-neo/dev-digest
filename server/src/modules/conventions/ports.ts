import type { ConventionCandidate, ConventionStatus, FeatureModelChoice } from '@devdigest/shared';
import type { GroundedConvention } from './domain.js';

/** The repo the extractor works on (workspace-checked). */
export interface ConventionsRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  cloned: boolean;
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
}

/** What the conventions service needs from storage. Every call is workspace-scoped. */
export interface ConventionsRepositoryPort {
  getRepo(workspaceId: string, repoId: string): Promise<ConventionsRepoRef | undefined>;
  list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /** Rules already accepted for the repo (survive a re-scan). */
  acceptedRules(workspaceId: string, repoId: string): Promise<string[]>;
  /** Re-scan: drop every non-accepted candidate of the repo, insert the new ones. */
  replaceUnaccepted(workspaceId: string, repoId: string, items: GroundedConvention[]): Promise<void>;
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate | undefined>;
  /** Accept/reject every candidate of the repo at once ("Deselect all" / "Select all"). */
  setAllStatus(workspaceId: string, repoId: string, status: ConventionStatus): Promise<void>;
  /** Workspace override for the `conventions` feature model, if any. */
  featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined>;
}
