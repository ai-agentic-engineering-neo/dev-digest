/**
 * pr-brief — ports (ring 1). Plain types only: what the service needs from
 * persistence, its sibling modules (intent, smart diff, blast), the LLM, the
 * job runner and the run log. `routes.ts` assembles `PrBriefDeps` from the
 * container; tests pass fakes.
 */
import type {
  BlastRadiusResponse,
  LLMProvider,
  PrBrief,
  PrBriefReview,
  Provider,
  RunLogLine,
  RunSummary,
  RunTrace,
  SmartDiff,
} from '@devdigest/shared';

export interface RunUsage {
  provider?: string | null;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number | null;
  durationMs?: number;
}

export interface PullInfo {
  id: string;
  number: number;
  title: string;
  branch: string;
  body: string | null;
  headSha: string;
}

export interface PrFileInfo {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface ReviewFindingInput {
  title: string;
  severity: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
}

/** The newest `kind = review` review: read-time facts plus its non-dismissed findings. */
export interface NewestReview {
  facts: PrBriefReview;
  findings: ReviewFindingInput[];
}

export interface PrBriefRepositoryPort {
  /** undefined = the PR is not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<PullInfo | undefined>;
  getPrFiles(workspaceId: string, prId: string): Promise<PrFileInfo[]>;
  getNewestReview(workspaceId: string, prId: string): Promise<NewestReview | undefined>;
  getLatestRun(workspaceId: string, prId: string): Promise<RunSummary | undefined>;
  /** The stored brief, or null when none exists or its json no longer matches the contract. */
  getStored(workspaceId: string, prId: string): Promise<PrBrief | null>;
  /** A `kind = brief` run in `running` state. Throws `ConflictError` when one is already running for the PR. */
  createRun(workspaceId: string, prId: string, model: { provider: string; model: string }): Promise<RunSummary>;
  /** Marks the run failed; the stored brief is untouched. */
  failRun(workspaceId: string, runId: string, error: string, usage?: RunUsage): Promise<void>;
  /** One transaction: replace the stored brief, finish the run as done, store its trace. Throws `NotFoundError` when the PR is gone. */
  completeRun(
    workspaceId: string,
    prId: string,
    runId: string,
    brief: PrBrief,
    usage: RunUsage,
    trace: RunTrace,
  ): Promise<void>;
  saveTrace(workspaceId: string, runId: string, trace: RunTrace): Promise<void>;
}

/** Structural slice of the reviews module's intent store (never derived here). */
export interface IntentReader {
  get(
    workspaceId: string,
    prId: string,
  ): Promise<{ intent: string; inScope: string[]; outOfScope: string[] } | undefined>;
}

export interface SmartDiffReader {
  get(workspaceId: string, prId: string): Promise<SmartDiff>;
}

export interface BlastReader {
  get(workspaceId: string, prId: string): Promise<BlastRadiusResponse>;
}

/** Where run log lines go (a `RunLogger` satisfies this structurally). */
export interface BriefRunLog {
  info(msg: string, data?: unknown): void;
  tool(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  logFor(runId: string): RunLogLine[];
}

export interface PrBriefDeps {
  repo: PrBriefRepositoryPort;
  intent: IntentReader;
  smartDiff: SmartDiffReader;
  blast: BlastReader;
  repoIntelEnabled: boolean;
  llm: (provider: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  jobs: {
    register(kind: string, handler: (payload: unknown) => Promise<void>): void;
    enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
  };
  /** The system prompt text (loaded by routes.ts so the service does no file I/O). */
  systemPrompt: () => Promise<string>;
  /** Run log for one run (SSE bus, trace, pino). */
  runLog: (runId: string, prId: string) => BriefRunLog;
  now?: () => Date;
}

/** Job payload for one generation run. */
export interface GenerateJobPayload {
  workspaceId: string;
  prId: string;
  runId: string;
  /** Captured when the run started (EC-2): a later commit or review makes the brief stale. */
  headSha: string;
  sourceReviewId: string | null;
}
