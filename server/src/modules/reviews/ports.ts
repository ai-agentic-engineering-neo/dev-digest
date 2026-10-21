/**
 * reviews: intent ports (ring 1). Plain types only: what the intent service
 * needs from persistence, GitHub, git and the LLM, and the narrow port the run
 * executor uses to get an intent before the agent loop. `routes.ts` assembles
 * `IntentDeps` from the container; tests pass fakes.
 */
import type {
  GitClient,
  GitHubClient,
  IntentConfidence,
  IntentSource,
  LLMProvider,
  Provider,
} from '@devdigest/shared';

/** Everything the derivation reads from the database for one PR. */
export interface IntentInputs {
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  /** Commit messages, newest first (subject line is taken by the service). */
  commits: string[];
  /** Changed file paths from the persisted PR files. */
  changedPaths: string[];
}

/** A persisted intent as the repository hands it to the service (no row types). */
export interface StoredIntent {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  sourceHash: string | null;
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number | null;
  derivedAt: Date | null;
}

export type SaveIntentInput = Omit<StoredIntent, 'prId'>;

export interface IntentRepositoryPort {
  /** PR + repo + commits + files for the derivation; undefined when the PR is not in the workspace. */
  getInputs(workspaceId: string, prId: string): Promise<IntentInputs | undefined>;
  /** The stored intent; undefined when none, or when the PR is not in the workspace. */
  get(workspaceId: string, prId: string): Promise<StoredIntent | undefined>;
  /** Insert or replace the PR's intent. Returns undefined when the PR is not in the workspace. */
  save(workspaceId: string, prId: string, value: SaveIntentInput): Promise<StoredIntent | undefined>;
}

/** Optional ticket lookup (Jira/Linear). Declared, unwired in v1: keys are detected only. */
export interface TicketLookupPort {
  lookup(key: string): Promise<{ title: string; description: string } | null>;
}

/** Where intent progress lines go (a `RunLogger` satisfies this structurally). */
export interface IntentLog {
  info(msg: string, data?: unknown): void;
  tool(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
}

export interface IntentDeps {
  repo: IntentRepositoryPort;
  github: () => Promise<Pick<GitHubClient, 'getIssue' | 'getClosingIssues' | 'getFileContent'>>;
  git: Pick<GitClient, 'showFile'>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  ticket?: TicketLookupPort;
  now?: () => Date;
}

/** The intent as the review prompt consumes it. */
export interface IntentForPrompt {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: IntentConfidence;
  basis: string[];
}

export type EnsureIntentResult =
  | {
      status: 'ok';
      part: IntentForPrompt;
      cached: boolean;
      /** `<provider>/<model>` the intent was derived with. */
      model: string;
      ms: number;
      /** Refs of used/truncated issues and docs, for the trace's `specs_read`. */
      usedRefs: string[];
    }
  | { status: 'failed'; ms: number };

/** What the run executor calls. Never throws. */
export interface IntentDeriverPort {
  ensureIntent(
    workspaceId: string,
    prId: string,
    opts: { changedPaths?: string[]; log: IntentLog },
  ): Promise<EnsureIntentResult>;
}

/** One attached project document resolved for a run (SPEC-01). */
export interface ProjectContextBlockDto {
  path: string;
  text: string;
  tokens: number;
  truncated: boolean;
  /** 'agent' or 'skill:<name>'. */
  source: string;
  /** The text came from a local override. */
  modified: boolean;
}

/** What the run executor calls to resolve project context. Never throws. */
export interface ProjectContextResolverPort {
  resolveForRun(
    workspaceId: string,
    input: {
      repoId: string;
      baseBranch: string;
      agentId: string;
      skills: { id: string; name: string }[];
      log: (message: string) => void;
    },
  ): Promise<{ blocks: ProjectContextBlockDto[]; totalTokens: number }>;
}
