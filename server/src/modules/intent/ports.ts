import type { FeatureModelChoice } from '@devdigest/shared';
import type {
  DerivedIntent,
  IntentConfidence,
  IntentConfidenceReason,
  IntentKind,
  IntentRecord,
  IntentSource,
  IntentUsage,
} from './domain/types.js';

export interface IntentPullContext {
  prId: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  owner: string;
  name: string;
  fullName: string;
  cloned: boolean;
}
export interface IntentChangedFile {
  path: string;
  patch: string | null;
}
export interface DerivedIntentWrite {
  derived: DerivedIntent;
  kind: IntentKind;
  confidence: IntentConfidence;
  confidenceReason: IntentConfidenceReason;
  confidenceLowered: boolean;
  sources: IntentSource[];
  headSha: string;
  inputHash: string;
  bodyHash: string;
  usage: IntentUsage;
}
export interface IntentFailureWrite {
  error: string;
  sources: IntentSource[];
  headSha: string;
  inputHash: string | null;
  bodyHash: string;
  usage: IntentUsage | null;
}
export interface IntentOverrideWrite {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
}

/** Storage for the intent module. Child-table calls take prId ONLY after getPullContext checked the workspace. */
export interface IntentRepositoryPort {
  /** pull_requests joined with repos, both filtered by workspace_id. */
  getPullContext(workspaceId: string, prId: string): Promise<IntentPullContext | undefined>;
  /** Oldest to newest (committed_at, then id). */
  listCommitMessages(prId: string, limit: number): Promise<string[]>;
  /** pr_files, path asc. */
  listChangedFiles(prId: string): Promise<IntentChangedFile[]>;
  knownPullNumbers(repoId: string, numbers: readonly number[]): Promise<Set<number>>;
  get(prId: string): Promise<IntentRecord | undefined>;
  /** Upsert; status 'ok', error null; NEVER sets override_*. */
  saveDerived(prId: string, w: DerivedIntentWrite): Promise<IntentRecord>;
  /** Upsert; when existing status = 'ok' the row is unchanged and the existing record is returned. */
  saveFailure(prId: string, w: IntentFailureWrite): Promise<IntentRecord>;
  /** Upsert; a new row gets status 'none'. */
  setOverride(prId: string, w: IntentOverrideWrite): Promise<IntentRecord>;
  /** override_* set to NULL; deletes the row when status = 'none'. */
  clearOverride(prId: string): Promise<IntentRecord | undefined>;
  /** settings.feature_models.review_intent (safeParse). */
  featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined>;
}
