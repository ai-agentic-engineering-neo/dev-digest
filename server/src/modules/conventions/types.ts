import type {
  ConventionCategory,
  ConventionStatus,
  FeatureModelChoice,
  GitClient,
  LLMProvider,
  Provider,
  Skill,
  SkillType,
} from '@devdigest/shared';

/**
 * Ports + domain shapes for the conventions module (ring 2). The service
 * depends on these narrow interfaces, never on the Container, the Drizzle
 * repository, or another module's service; `routes.ts` wires the real
 * implementations (see `inner-no-container` in the onion rules).
 */

/** A persisted candidate (camelCase domain shape); Drizzle rows are assignable to it. */
export interface ConventionRecord {
  id: string;
  workspaceId: string;
  repoId: string | null;
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  evidenceFiles: string[];
  occurrences: number;
  confidence: number | null;
  status: ConventionStatus;
  createdAt: Date;
}

/** A verified, clustered candidate ready to be inserted as `pending`. */
export interface NewConvention {
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  evidencePath: string;
  evidenceLine: number;
  /** Taken FROM THE FILE, not from the model: displayed evidence is real code. */
  evidenceSnippet: string;
  /** Sampled files containing the snippet, primary path first. */
  evidenceFiles: string[];
  occurrences: number;
  confidence: number;
}

export interface ConventionPatch {
  rule?: string;
  rationale?: string | null;
  category?: ConventionCategory;
  status?: ConventionStatus;
}

/** Just enough of a repo row to read files from its clone. */
export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

/** Persistence port. Every read/write is workspace-scoped. */
export interface ConventionsStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined>;
  /** Every row for the repo, INCLUDING rejected (needed for de-duplication). */
  listForRepo(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  getById(workspaceId: string, id: string): Promise<ConventionRecord | undefined>;
  /** Replace this repo's `pending` rows; accepted/rejected rows are untouched. */
  replacePending(
    workspaceId: string,
    repoId: string,
    rows: NewConvention[],
  ): Promise<ConventionRecord[]>;
  update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionRecord | undefined>;
}

/** repo-intel's sampling seam (pure code, no model). */
export interface ConventionSampler {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/**
 * The skills module as this feature sees it. Every write goes through the
 * SkillsService, so the prompt-injection scan on skill bodies applies to
 * conventions-created skills too.
 */
export interface ConventionSkillsPort {
  findByName(workspaceId: string, name: string): Promise<{ id: string } | undefined>;
  create(
    workspaceId: string,
    input: {
      name: string;
      description: string;
      type: SkillType;
      body: string;
      source: 'extracted';
      enabled: boolean;
    },
  ): Promise<Skill>;
  /** A changed body bumps the skill's version. */
  update(
    workspaceId: string,
    id: string,
    patch: { description: string; type: SkillType; body: string },
  ): Promise<Skill | undefined>;
}

/** Additive agent link; never the replace-all form (it would wipe other skills). */
export interface ConventionAgentsPort {
  /** false when the agent is not in this workspace. */
  linkSkill(workspaceId: string, agentId: string, skillId: string): Promise<boolean>;
}

/** The slice of a structured logger the service needs. */
export interface ConventionsLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Explicit dependencies of `ConventionsService`. */
export interface ConventionsDeps {
  store: ConventionsStore;
  git: Pick<GitClient, 'readFile'>;
  repoIntel: ConventionSampler;
  /** Resolve an LLM provider by id (the container's factory, injected). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Settings -> Feature Models override for `conventions`, else the registry default. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  skills: ConventionSkillsPort;
  agents: ConventionAgentsPort;
  log: ConventionsLogger;
}
