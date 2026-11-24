import type {
  ConventionBulkAccept,
  ConventionCandidate,
  ConventionExtractResult,
  ConventionUpdate,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { readContainedFile } from '../../platform/contained-read.js';
import { loadPromptTemplate, renderTemplate } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CONFIG_FILES,
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA_NAME,
  MAX_CANDIDATES,
  MAX_FILE_CHARS,
  MAX_TOTAL_CHARS,
  TOP_N,
} from './constants.js';
import {
  ConventionExtraction,
  buildExtractionMessages,
  groundCandidates,
  normalizeWs,
  toConventionDto,
} from './helpers.js';
import { ConventionsRepository } from './repository.js';

interface SampleFile {
  path: string;
  content: string;
}

export class ConventionsService {
  private _repo?: ConventionsRepository;

  constructor(private container: Container) {}

  private get repo() {
    return (this._repo ??= new ConventionsRepository(this.container.db));
  }

  /** 404 unless the repo belongs to the workspace. Returns what extraction needs. */
  async assertRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.assertRepo(workspaceId, repoId);
    return (await this.repo.listByRepo(workspaceId, repoId)).map(toConventionDto);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.assertRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new AppError('repo_not_ready', 'The repo is not cloned yet.', 409);
    }

    const files = await this.collectSamples(repo.clonePath, repoId);
    const codeFiles = files.filter((f) => !CONFIG_SET.has(f.path));
    if (codeFiles.length === 0) {
      throw new AppError(
        'repo_not_ready',
        'No indexed source files to analyze. Index the repo first.',
        409,
      );
    }

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'conventions',
    );
    const llm = await this.container.llm(provider);
    const template = renderTemplate(await loadPromptTemplate(EXTRACT_PROMPT), {
      max: String(MAX_CANDIDATES),
    });
    const res = await llm.completeStructured({
      model,
      schema: ConventionExtraction,
      schemaName: EXTRACT_SCHEMA_NAME,
      messages: buildExtractionMessages(template, files),
      temperature: 0,
    });

    const filesByPath = new Map(files.map((f) => [f.path, f.content]));
    const { kept, dropped: ungrounded } = groundCandidates(res.data.conventions, filesByPath);

    // Accepted candidates survive a re-scan; don't re-add the same rule next to them.
    const existing = await this.repo.listByRepo(workspaceId, repoId);
    const acceptedRules = new Set(
      existing.filter((c) => c.accepted).map((c) => normalizeWs(c.rule).toLowerCase()),
    );
    const fresh = kept.filter((c) => !acceptedRules.has(normalizeWs(c.rule).toLowerCase()));

    await this.repo.replacePending(workspaceId, repoId, fresh);
    const candidates = (await this.repo.listByRepo(workspaceId, repoId)).map(toConventionDto);
    return {
      candidates,
      sampled_files: codeFiles.length,
      dropped: ungrounded + (kept.length - fresh.length),
    };
  }

  /** Build the model input by code: style configs first, then the top-ranked source files. */
  private async collectSamples(clonePath: string, repoId: string): Promise<SampleFile[]> {
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, TOP_N);
    const paths = [...CONFIG_FILES, ...ranked.filter((p) => !CONFIG_SET.has(p))];
    const out: SampleFile[] = [];
    let budget = MAX_TOTAL_CHARS;
    for (const path of paths) {
      if (budget <= 0) break;
      const raw = await readContainedFile(clonePath, path);
      if (raw === null || raw.trim() === '') continue;
      // Cut the model's view, but ground against exactly what it saw.
      const content = raw.slice(0, Math.min(MAX_FILE_CHARS, budget));
      budget -= content.length;
      out.push({ path, content });
    }
    return out;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdate,
  ): Promise<ConventionCandidate> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(workspaceId, id))) throw new NotFoundError('Convention not found');
  }

  async setAll(
    workspaceId: string,
    repoId: string,
    { accepted }: ConventionBulkAccept,
  ): Promise<ConventionCandidate[]> {
    await this.assertRepo(workspaceId, repoId);
    await this.repo.setAcceptedForRepo(workspaceId, repoId, accepted);
    return (await this.repo.listByRepo(workspaceId, repoId)).map(toConventionDto);
  }
}

const CONFIG_SET: ReadonlySet<string> = new Set(CONFIG_FILES);
