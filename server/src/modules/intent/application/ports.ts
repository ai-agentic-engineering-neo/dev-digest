/**
 * Ports of the intent use cases. Infrastructure implements the store, model,
 * doc and ticket sources; the composition root adapts settings/LLM, git,
 * GitHub and the shared pull/repo lookup onto the rest.
 */
import type { ChatMessage, Intent, PrIntentRecord, Provider } from '@devdigest/shared';
import type { IntentClassification } from '../domain/classification.js';

/** The pull the intent layer needs — a structural subset of reviews' ReviewPull. */
export interface IntentPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface IntentRepo {
  id: string;
  owner: string;
  name: string;
}

export interface IntentCommit {
  sha: string;
  message: string;
}

/** Standalone HTTP routes (GET/refresh) look the PR up themselves; resolveForReview already has it. */
export interface PullLookup {
  getPull(workspaceId: string, prId: string): Promise<IntentPull | undefined>;
  getRepo(repoId: string): Promise<IntentRepo | undefined>;
  getCommits(prId: string): Promise<IntentCommit[]>;
  /** Changed file paths from `pr_files` — used by refresh (no live diff there). */
  getChangedFiles(prId: string): Promise<string[]>;
}

export interface ResolvedModel {
  provider: Provider;
  model: string;
}

export interface ClassifyResult {
  data: IntentClassification;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/** The workspace's `review_intent` feature model. */
export interface IntentModel {
  /** Cheap — no LLM call; needed BEFORE the cache key (server/specs/05-intent-layer.md). */
  resolve(workspaceId: string): Promise<ResolvedModel>;
  classify(resolved: ResolvedModel, messages: ChatMessage[], signal: AbortSignal): Promise<ClassifyResult>;
}

export type DocReadResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; reason: string };

/** A doc's content at the PR head sha — git first, GitHub Contents API fallback. */
export interface DocSource {
  read(repo: IntentRepo, headSha: string, path: string): Promise<DocReadResult>;
}

export type TicketReadResult =
  | { ok: true; title: string; body: string }
  | { ok: false; reason: string };

/** A same-repo GitHub issue (server/specs/05-intent-layer.md — no Jira/Linear). */
export interface TicketSource {
  read(repo: IntentRepo, number: number): Promise<TicketReadResult>;
}

/** A new/updated pr_intent row (application builds it; infrastructure persists + maps it). */
export interface IntentRecordInput {
  prId: string;
  intent: Intent;
  headSha: string;
  inputHash: string;
  promptVersion: number;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  derivedAt: Date;
}

export interface IntentStore {
  get(prId: string): Promise<PrIntentRecord | undefined>;
  upsert(record: IntentRecordInput): Promise<PrIntentRecord>;
}

/** Wall clock (injectable for tests). */
export type Clock = () => Date;
