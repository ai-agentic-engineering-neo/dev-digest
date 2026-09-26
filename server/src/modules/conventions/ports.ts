/**
 * conventions — ports (ring 1). Plain types only: what the service needs from
 * persistence, the repo clone, repo-intel, the LLM, the job runner and the
 * skills/agents modules. `routes.ts` assembles `ConventionsDeps` from the
 * container; tests pass fakes.
 */
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionStatus,
  LLMProvider,
  Provider,
  Skill,
} from '@devdigest/shared';

export interface NewCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface CandidatePatch {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface ConventionsRepositoryPort {
  getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScan | undefined>;
  createScan(workspaceId: string, repoId: string, model: { provider: string; model: string }): Promise<ConventionScan>;
  finishScan(
    workspaceId: string,
    scanId: string,
    result: { status: 'done' | 'failed'; sampleCount: number; candidatesFound: number; candidatesKept: number; error?: string },
  ): Promise<void>;
  listCandidates(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /**
   * Replace the repo's candidates with the new scan's, keeping every `rejected`
   * row (matched by rule) so a dismissed rule does not come back. Returns the
   * number of rows written.
   */
  replaceCandidates(workspaceId: string, repoId: string, scanId: string, rows: NewCandidate[]): Promise<number>;
  updateCandidate(workspaceId: string, id: string, patch: CandidatePatch): Promise<ConventionCandidate | undefined>;
  /** `accepted → candidate` for every accepted row of the repo ("Deselect all"). */
  deselectAll(workspaceId: string, repoId: string): Promise<number>;
}

export interface RepoLookupPort {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; owner: string; name: string; fullName: string; clonePath: string | null } | undefined>;
}

export interface ConventionsDeps {
  repo: ConventionsRepositoryPort;
  repos: RepoLookupPort;
  repoIntel: { getConventionSamples(repoId: string, n: number): Promise<string[]> };
  git: { readFile(repo: { owner: string; name: string }, path: string): Promise<string> };
  llm: (provider: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  jobs: {
    register(kind: string, handler: (payload: unknown) => Promise<void>): void;
    enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
  };
  /** The slice of the skills service this module uses (structural: no import of that module). */
  skills: {
    findByName(workspaceId: string, name: string): Promise<Skill | undefined>;
    create(
      workspaceId: string,
      input: { name: string; description: string; type: Skill['type']; body: string; enabled?: boolean; source?: 'extracted' },
    ): Promise<Skill>;
    update(
      workspaceId: string,
      id: string,
      patch: { description?: string; type?: Skill['type']; body?: string; enabled?: boolean },
    ): Promise<Skill>;
  };
  agents: { linkSkill(workspaceId: string, agentId: string, skillId: string): Promise<unknown | undefined> };
  log?: (msg: string, data?: unknown) => void;
}

/** Job payload for one extraction run. */
export interface ExtractJobPayload {
  workspaceId: string;
  repoId: string;
  scanId: string;
}

export interface CreateConventionSkillInput {
  name: string;
  description: string;
  type: Skill['type'];
  body: string;
  enabled?: boolean;
  agent_id: string;
}
