/**
 * onboarding — ports (ring 1). Plain types only: what the service needs from
 * persistence, the repo record, repo-intel, git, the LLM and the job runner.
 * `routes.ts` assembles `OnboardingDeps` from the container; tests pass fakes.
 */
import type { GitClient, LLMProvider, Onboarding, OnboardingRun, Provider } from '@devdigest/shared';

export interface RunUsage {
  provider?: string | null;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number | null;
  filesIndexed?: number;
}

export interface OnboardingRepositoryPort {
  /** The stored tour, or null when none exists or its json no longer matches the contract. */
  getStored(workspaceId: string, repoId: string): Promise<Onboarding | null>;
  getLatestRun(workspaceId: string, repoId: string): Promise<OnboardingRun | undefined>;
  createRun(workspaceId: string, repoId: string, model: { provider: string; model: string }): Promise<OnboardingRun>;
  /** Marks the run failed; the stored tour is untouched. */
  failRun(workspaceId: string, runId: string, error: string, usage?: RunUsage): Promise<void>;
  /** One transaction: replace the stored tour and finish the run as done. */
  completeRun(workspaceId: string, repoId: string, runId: string, tour: Onboarding): Promise<void>;
}

export interface RepoLookupPort {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<
    | {
        id: string;
        owner: string;
        name: string;
        fullName: string;
        defaultBranch: string;
        clonePath: string | null;
        lastPolledAt: Date | null;
      }
    | undefined
  >;
}

/** Structural slice of the repo-intel facade (no import of that module). */
export interface RepoIntelPort {
  getIndexState(
    repoId: string,
  ): Promise<{ status: 'full' | 'partial' | 'degraded' | 'failed'; filesIndexed: number; updatedAt: Date }>;
  getTopFilesByRank(repoId: string, n: number): Promise<string[]>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
  getFileRank(repoId: string, paths: string[]): Promise<{ path: string }[]>;
}

export interface OnboardingDeps {
  repo: OnboardingRepositoryPort;
  repos: RepoLookupPort;
  repoIntel: RepoIntelPort;
  repoIntelEnabled: boolean;
  git: Pick<GitClient, 'listFiles' | 'showFile'>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  jobs: {
    register(kind: string, handler: (payload: unknown) => Promise<void>): void;
    enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
  };
  /** The system prompt text (loaded by routes.ts so the service does no file I/O). */
  systemPrompt: () => Promise<string>;
  log?: (msg: string, data?: unknown) => void;
  now?: () => Date;
}

/** Job payload for one generation run. */
export interface GenerateJobPayload {
  workspaceId: string;
  repoId: string;
  runId: string;
}
