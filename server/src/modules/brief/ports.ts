import type { FeatureModelChoice, LLMProvider } from '@devdigest/shared';
import type { BriefBlastView, BriefIntentView, BriefSpecDoc, StoredBrief } from './domain/types.js';

export interface BriefPullContext {
  prId: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  fullName: string;
}
export interface BriefFileRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface BriefRepositoryPort {
  /** pull_requests joined with repos, BOTH workspace-filtered. */
  getPullContext(workspaceId: string, prId: string): Promise<BriefPullContext | undefined>;
  /** pr_files, path asc (call only after getPullContext). */
  listChangedFiles(prId: string): Promise<BriefFileRow[]>;
  countChangedFiles(prId: string): Promise<number>;
  /** StoredBriefSchema.safeParse(json); invalid -> undefined. */
  get(prId: string): Promise<StoredBrief | undefined>;
  /** Upsert on pr_id (replace). */
  save(prId: string, brief: StoredBrief): Promise<void>;
  /** settings.feature_models.risk_brief (safeParse). */
  featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined>;
}

/** = container.intent */
export interface BriefIntentSource {
  get(workspaceId: string, prId: string): Promise<BriefIntentView | null>;
}
/** = container.blast */
export interface BriefBlastSource {
  forPull(workspaceId: string, prId: string): Promise<BriefBlastView>;
}
/** = container.projectContext */
export interface BriefSpecDocsSource {
  forBrief(workspaceId: string, repoId: string): Promise<{ included: BriefSpecDoc[] }>;
}
/** = container.briefLlm */
export type BriefLlmResolver = (provider: FeatureModelChoice['provider']) => Promise<LLMProvider>;

export interface BriefDeps {
  briefRepo: BriefRepositoryPort;
  intent: BriefIntentSource;
  blast: BriefBlastSource;
  projectContext: BriefSpecDocsSource;
  briefLlm: BriefLlmResolver;
}

export interface BriefLogRecord {
  event: 'brief';
  prId: string;
  outcome: 'ready' | 'failed' | 'rejected';
  joined: boolean;
  reason: string | null;
  latencyMs: number;
  provider: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Raw provider error message of a failed model call — server log only, never in a response. */
  providerError?: string;
}
export interface BriefLogger {
  info(fields: BriefLogRecord, msg: string): void;
  warn(fields: BriefLogRecord, msg: string): void;
}
