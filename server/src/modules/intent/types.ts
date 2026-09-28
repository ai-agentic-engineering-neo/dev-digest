/**
 * What the intent use cases need from the outside, declared here by the
 * consumer — the same "structural port" shape as `ConventionsDeps` and
 * `ReviewsDeps`. Nothing in this module imports `pulls/repository.js`,
 * `repos/repository.js` or `settings/helpers.js`; the container's concrete
 * repositories satisfy these interfaces without knowing they exist.
 */
import type {
  GitClient,
  GitHubClient,
  IntentConfidence,
  IntentSource,
  LLMProvider,
} from '@devdigest/shared';
import type { PromptLog } from '../../platform/prompt-log.js';

// ---- ports ------------------------------------------------------------

/** The one row `pr_intent` holds, in camelCase domain shape. */
export interface StoredIntent {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  sourceHash: string | null;
  textHash: string | null;
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  derivedAt: string;
}

/** Owns `pr_intent`. Only `intent/repository.ts` implements this. */
export interface IntentStore {
  get(prId: string): Promise<StoredIntent | undefined>;
  upsert(value: StoredIntent): Promise<void>;
  /** Update `head_sha` only — a verified cache hit, not a re-derivation. */
  touchHeadSha(prId: string, headSha: string): Promise<void>;
}

/** The PR fields the derivation actually reads. `PullsRepository` satisfies this. */
export interface IntentPullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  labels: string[];
}

export interface IntentPullFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface IntentPullCommit {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | string | null;
}

export interface IntentPullsReader {
  getById(workspaceId: string, prId: string): Promise<IntentPullRecord | undefined>;
  listFiles(prId: string): Promise<IntentPullFile[]>;
  listCommits(prId: string): Promise<IntentPullCommit[]>;
}

/** `RepoRepository` satisfies this structurally (its row carries more fields). */
export interface IntentRepoReader {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; owner: string; name: string } | undefined>;
}

/** Restated rather than imported from `settings/helpers.ts` — a module's
 * internals are not a shared type, even a two-field one. */
export interface IntentSettingsReader {
  listForWorkspace(workspaceId: string): Promise<{ key: string; value: unknown }[]>;
}

/** Only the two git operations the derivation is allowed: read at a pinned
 * commit, and fetch the PR head when that read misses. Never `readFile`. */
export type IntentGitReader = Pick<GitClient, 'fetchPullHead' | 'readFileAt'>;

export interface IntentDeps {
  readonly intentRepo: IntentStore;
  readonly pullsRepo: IntentPullsReader;
  readonly repoRepo: IntentRepoReader;
  readonly settingsRepo: IntentSettingsReader;
  readonly git: IntentGitReader;
  github(): Promise<GitHubClient>;
  llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
  promptLog(): PromptLog;
}

// ---- domain types -------------------------------------------------------

/** Output of `parseReferences`: what the author's own text points at. */
export interface ParsedReferences {
  /** Repo-relative doc paths, already guard-checked (no `..`, not absolute). */
  docPaths: string[];
  /** Same-repo issue numbers (closing keywords, `#N`, `owner/repo#N`, URLs). */
  issueNumbers: number[];
  /** Things the text points at that are deliberately never fetched:
   * cross-repo issues, other-host URLs, ticket keys. */
  unresolved: IntentSource[];
}

export interface CollectedDoc {
  path: string;
  /** Content as used (already capped to `MAX_DOC_CHARS`). */
  content: string;
  truncated: boolean;
}

export interface CollectedIssue {
  number: number;
  title: string;
  /** Body as used (already capped to `MAX_ISSUE_CHARS`). */
  body: string;
}

export interface CollectedIndirect {
  branch: string;
  commitSubjects: string[];
  files: { path: string; additions: number; deletions: number }[];
  labels: string[];
}

/** Everything `collectSources` gathered, ready for hashing, rendering and the prompt. */
export interface CollectedSources {
  title: string;
  /** Body as used: capped, and boilerplate-stripped for the substantive check. */
  body: string;
  bodySubstantive: boolean;
  docs: CollectedDoc[];
  issues: CollectedIssue[];
  indirect: CollectedIndirect;
  sources: IntentSource[];
  /** A source that should have been reachable (GitHub, the clone) failed —
   * review-mode reuse then prefers a stale-but-good stored intent. */
  degraded: boolean;
}

/**
 * What `resolveForReview` hands back — never throws, so the reviews module
 * can always fall through to "no intent" without a try/catch of its own.
 */
export type ReviewIntentResolution =
  | {
      status: 'ready';
      /** Pre-rendered block for `ReviewInput.intent` (untrusted). */
      promptBlock: string;
      confidence: IntentConfidence;
      cache: 'hit' | 'miss';
      provider: string | null;
      model: string | null;
      tokensIn: number | null;
      tokensOut: number | null;
      costUsd: number | null;
      sourcesUsed: string[];
      sourcesUnresolved: string[];
    }
  | {
      status: 'unavailable';
      reason: string;
    };
