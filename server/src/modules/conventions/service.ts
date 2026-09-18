import type { GitClient, RepoRef, Skill } from '@devdigest/shared';
import {
  ConventionExtraction,
  type ConventionCompose,
  type ConventionExtractionItem,
  type ConventionList,
  type ConventionPatch,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { AgentsService } from '../agents/service.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsService } from '../skills/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CONFIG_BASENAMES,
  CONVENTION_EXTRACTION_SCHEMA,
  CONVENTION_SAMPLE_N,
} from './constants.js';
import {
  groundCandidate,
  isSafeRepoPath,
  shouldInsertPending,
  toConventionDto,
} from './helpers.js';
import { ConventionsRepository, type InsertPendingConvention } from './repository.js';

/**
 * Conventions extractor. Samples configs + top-N files in code (no model pick),
 * asks the workspace conventions model for grounded candidates, persists survivors.
 * Compose goes through SkillsService (source=extracted) and optional AgentsService.linkSkill.
 */
export class ConventionsService {
  private conventions: ConventionsRepository;
  private repos: RepoRepository;
  private skills: SkillsService;
  private agents: AgentsService;

  constructor(private container: Container) {
    this.conventions = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
    this.skills = new SkillsService(container);
    this.agents = new AgentsService(container);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const rows = await this.conventions.list(workspaceId, repoId);
    return {
      items: rows.map(toConventionDto),
      extracted_at: repo.conventionsExtractedAt?.toISOString() ?? null,
      sample_file_count: repo.conventionsSampleCount ?? 0,
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    const files = await this.collectSamples(ref, repoId);
    const candidates = files.size > 0 ? await this.propose(workspaceId, files) : [];

    const grounded = candidates.filter((c) =>
      groundCandidate(files.get(c.evidence_path) ?? null, c),
    );
    const existing = await this.conventions.list(workspaceId, repoId);
    const kept = existing.filter((row) => row.status !== 'pending');
    const inserts: InsertPendingConvention[] = grounded
      .filter((c) => shouldInsertPending(kept, c))
      .map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet,
        confidence: c.confidence,
        category: c.category.trim() || null,
        evidenceStartLine: c.evidence_start_line,
        evidenceEndLine: c.evidence_end_line,
      }));

    await this.conventions.replacePending(workspaceId, repoId, inserts);
    await this.repos.updateConventionsExtract(repoId, new Date(), files.size);
    return this.list(workspaceId, repoId);
  }

  async patch(
    workspaceId: string,
    repoId: string,
    conventionId: string,
    patch: ConventionPatch,
  ): Promise<ConventionList['items'][number]> {
    if (!(await this.repos.getById(workspaceId, repoId))) throw new NotFoundError('Repo not found');
    if (patch.status === undefined && patch.rule === undefined) {
      throw new ValidationError('Provide status and/or rule');
    }
    const row = await this.conventions.update(workspaceId, repoId, conventionId, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async compose(workspaceId: string, repoId: string, input: ConventionCompose): Promise<Skill> {
    if (!(await this.repos.getById(workspaceId, repoId))) throw new NotFoundError('Repo not found');
    const uniqueIds = [...new Set(input.convention_ids)];
    const rows = await this.conventions.getByIds(workspaceId, repoId, uniqueIds);
    if (rows.length !== uniqueIds.length || rows.some((row) => row.status !== 'accepted')) {
      throw new AppError('validation_error', 'Every convention id must be accepted in this repo', 400);
    }
    const skill = await this.skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      enabled: input.enabled,
      source: 'extracted',
    });
    if (input.agent_id) {
      const links = await this.agents.linkSkill(workspaceId, input.agent_id, skill.id);
      if (!links) throw new NotFoundError('Agent not found');
    }
    return skill;
  }

  private async collectSamples(ref: RepoRef, repoId: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    for (const basename of CONFIG_BASENAMES) {
      const text = await this.readCloneText(this.container.git, ref, basename);
      if (text) files.set(basename, text);
    }
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, CONVENTION_SAMPLE_N);
    for (const path of ranked) {
      if (files.has(path)) continue;
      const text = await this.readCloneText(this.container.git, ref, path);
      if (text) files.set(path, text);
    }
    return files;
  }

  private async propose(
    workspaceId: string,
    files: Map<string, string>,
  ): Promise<ConventionExtractionItem[]> {
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const body = [...files.entries()]
      .map(([path, text]) => `### ${path}\n\`\`\`\n${text}\n\`\`\``)
      .join('\n\n');
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: CONVENTION_EXTRACTION_SCHEMA,
      messages: [
        {
          role: 'system',
          content:
            'Extract coding conventions that are actually present in the files. Each candidate must cite evidence_path, 1-based line range, and a snippet that appears in that range.',
        },
        { role: 'user', content: body },
      ],
    });
    return result.data.candidates;
  }

  /** FLAG-2: missing file, thrown read, empty, or whitespace-only → null. */
  private async readCloneText(
    git: GitClient,
    repo: RepoRef,
    path: string,
  ): Promise<string | null> {
    if (!isSafeRepoPath(path)) return null;
    try {
      const text = await git.readFile(repo, path);
      if (typeof text !== 'string' || text.trim() === '') return null;
      return text;
    } catch {
      return null;
    }
  }
}
