import {
  FEATURE_MODELS,
  type ConventionCandidate,
  type ConventionExtractResult,
  type ConventionStatus,
  type FeatureModelChoice,
  type Skill,
  type SkillType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_SKILL_BODY_CHARS, SKILL_NAME_PATTERN } from '../_shared/skill-name.js';
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_SCHEMA_NAME,
  MAX_CONFIG_FILE_CHARS,
  MAX_SOURCE_FILE_CHARS,
  MAX_TOTAL_SAMPLE_CHARS,
  SAMPLE_TOP_FILES,
} from './constants.js';
import {
  CONFIG_FILE_NAMES,
  buildConventionsSkillDraft,
  dedupeConventions,
  groundCandidate,
  isSafeRelativePath,
  normalizeRepoPath,
  type ConventionsSkillDraft,
  type GroundedConvention,
} from './domain.js';
import type { ConventionsRepoRef } from './ports.js';
import { ConventionExtraction, buildExtractionMessages, type SampledFile } from './prompt.js';

/**
 * Conventions Extractor.
 *   1. sample — pure code, no model: config files (tsconfig/eslint/prettier/…)
 *      + the top-ranked source files from repoIntel.getConventionSamples().
 *   2. one cheap-model call → candidates {category, rule, evidence, confidence}.
 *   3. ground — code checks every candidate: the file exists, the snippet is
 *      really in it; line numbers come from that match. Ungrounded → dropped.
 *   4. the user accepts / rejects / edits; accepted ones merge into ONE
 *      `<repo>-conventions` skill (source `extracted` → trusted), optionally
 *      linked to an agent.
 */

export interface CreateConventionsSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  agent_id?: string | null;
}

export interface CreateConventionsSkillResult {
  skill: Skill;
  linked_agent_id: string | null;
}

type Deps = Pick<Container, 'conventionsRepo' | 'skillsRepo' | 'agentsRepo' | 'git' | 'repoIntel' | 'llm'>;

class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

const DEFAULT_MODEL: FeatureModelChoice = (() => {
  const def = FEATURE_MODELS.find((f) => f.id === 'conventions');
  return { provider: def?.defaultProvider ?? 'openai', model: def?.defaultModel ?? 'gpt-4.1-mini' };
})();

const looksBinary = (s: string): boolean => s.includes('\0');

const topDir = (path: string): string | null => {
  const i = path.indexOf('/');
  return i > 0 ? path.slice(0, i) : null;
};

export class ConventionsService {
  constructor(private deps: Deps) {}

  private get repo() {
    return this.deps.conventionsRepo;
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ConventionsRepoRef> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    return this.requireRepo(workspaceId, repoId).then(() => this.repo.list(workspaceId, repoId));
  }

  /** Read a repo file; null when missing, unreadable, unsafe or binary. */
  private async readRepoFile(repo: ConventionsRepoRef, path: string): Promise<string | null> {
    if (!isSafeRelativePath(path)) return null;
    try {
      const content = await this.deps.git.readFile({ owner: repo.owner, name: repo.name }, path);
      return looksBinary(content) ? null : content;
    } catch {
      return null;
    }
  }

  /**
   * Step 1 — sampling, fully in code. Returns the files sent to the model plus
   * their FULL contents (grounding checks the whole file, not the truncated head).
   */
  async sample(repo: ConventionsRepoRef): Promise<{ files: SampledFile[]; full: Map<string, string> }> {
    let top: string[] = [];
    try {
      top = await this.deps.repoIntel.getConventionSamples(repo.id, SAMPLE_TOP_FILES);
    } catch {
      top = []; // best-effort: an unindexed repo still gets its config files sampled
    }
    const dirs = [''];
    for (const p of top) {
      const d = topDir(p);
      if (d && !dirs.includes(d)) dirs.push(d);
    }
    const configPaths = dirs.flatMap((d) => CONFIG_FILE_NAMES.map((n) => (d ? `${d}/${n}` : n)));

    const files: SampledFile[] = [];
    const full = new Map<string, string>();
    let budget = MAX_TOTAL_SAMPLE_CHARS;
    const add = (path: string, content: string, kind: SampledFile['kind']) => {
      const cap = Math.min(kind === 'config' ? MAX_CONFIG_FILE_CHARS : MAX_SOURCE_FILE_CHARS, budget);
      if (cap <= 0 || content.trim() === '') return;
      const truncated = content.length > cap;
      files.push({ path, content: truncated ? content.slice(0, cap) : content, kind, truncated });
      full.set(path, content);
      budget -= Math.min(content.length, cap);
    };

    for (const path of configPaths) {
      const content = await this.readRepoFile(repo, path);
      if (content !== null) add(path, content, 'config');
    }
    for (const raw of top) {
      const path = normalizeRepoPath(raw);
      if (full.has(path)) continue;
      const content = await this.readRepoFile(repo, path);
      if (content !== null) add(path, content, 'source');
    }
    return { files, full };
  }

  private async modelFor(workspaceId: string): Promise<FeatureModelChoice> {
    return (await this.repo.featureModelOverride(workspaceId)) ?? DEFAULT_MODEL;
  }

  /** POST /repos/:id/conventions/extract — sample → model → ground → store. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.cloned) throw new ValidationError('The repo is not cloned yet — refresh it first');

    const { files, full } = await this.sample(repo);
    if (files.length === 0) {
      throw new ValidationError('Nothing to sample: no config files found and the repo is not indexed yet');
    }

    const choice = await this.modelFor(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildExtractionMessages(repo.fullName, files),
      temperature: 0,
      maxTokens: EXTRACTION_MAX_TOKENS,
    });

    const grounded: GroundedConvention[] = [];
    let dropped = 0;
    for (const raw of result.data.candidates) {
      const path = normalizeRepoPath(raw.evidence_path);
      // "Does the file exist?" — sampled files are already in memory; anything
      // else the model cites is read from the clone (safe paths only).
      const content = full.get(path) ?? (await this.readRepoFile(repo, path));
      const g = groundCandidate(raw, content);
      if (g.ok) grounded.push(g.value);
      else dropped++;
    }

    const accepted = await this.repo.acceptedRules(workspaceId, repoId);
    const fresh = dedupeConventions(grounded, accepted);
    await this.repo.replaceUnaccepted(workspaceId, repoId, fresh);

    return {
      candidates: await this.repo.list(workspaceId, repoId),
      sampled_files: files.map((f) => f.path),
      rejected_ungrounded: dropped,
    };
  }

  /** PATCH /conventions/:id — accept / reject / edit the rule text. */
  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string },
  ): Promise<ConventionCandidate> {
    const rule = patch.rule?.trim();
    if (patch.rule !== undefined && !rule) throw new ValidationError('Rule text is empty');
    const updated = await this.repo.update(workspaceId, id, { status: patch.status, rule });
    if (!updated) throw new NotFoundError('Convention not found');
    return updated;
  }

  /** "Deselect all" (→ pending) / "Accept all" for the repo's candidates. */
  async setAll(workspaceId: string, repoId: string, status: ConventionStatus): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    await this.repo.setAllStatus(workspaceId, repoId, status);
    return this.repo.list(workspaceId, repoId);
  }

  private async acceptedFor(workspaceId: string, repoId: string) {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = (await this.repo.list(workspaceId, repoId)).filter((c) => c.status === 'accepted');
    if (accepted.length === 0) throw new ValidationError('Accept at least one convention first');
    return { repo, accepted };
  }

  /** GET /repos/:id/conventions/skill-draft — the editable merged skill. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionsSkillDraft> {
    const { repo, accepted } = await this.acceptedFor(workspaceId, repoId);
    return buildConventionsSkillDraft(repo.name, accepted);
  }

  /**
   * POST /repos/:id/conventions/skill — save the (edited) draft as a trusted
   * `extracted` skill and optionally link it to an agent (appended last).
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionsSkillInput,
  ): Promise<CreateConventionsSkillResult> {
    const { accepted } = await this.acceptedFor(workspaceId, repoId);
    if (!SKILL_NAME_PATTERN.test(input.name)) {
      throw new ValidationError('Skill name must be kebab-case (a-z, 0-9, dashes)');
    }
    if (!input.body.trim()) throw new ValidationError('Skill body is empty');
    if (input.body.length > MAX_SKILL_BODY_CHARS) {
      throw new ValidationError(`Skill body exceeds ${MAX_SKILL_BODY_CHARS} characters`);
    }
    if (await this.deps.skillsRepo.getByName(workspaceId, input.name)) {
      throw new ConflictError(`A skill named "${input.name}" already exists`);
    }
    const agentId = input.agent_id ?? null;
    if (agentId && !(await this.deps.agentsRepo.getById(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }

    const skill = await this.deps.skillsRepo.insert({
      workspaceId,
      name: input.name,
      description: input.description.trim(),
      type: input.type,
      body: input.body,
      enabled: input.enabled ?? true,
      source: 'extracted',
      evidenceFiles: [...new Set(accepted.map((c) => c.evidence_path))],
    });

    if (agentId) {
      const links = await this.deps.agentsRepo.linkedSkills(agentId);
      await this.deps.agentsRepo.linkSkill(agentId, skill.id, links.length);
    }
    return { skill, linked_agent_id: agentId };
  }
}
