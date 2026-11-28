import {
  ConventionExtraction,
  type ConventionCandidate,
  type ConventionList,
  type ConventionPatch,
  type ConventionSkillInput,
  type Skill,
} from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  SAMPLE_FILE_COUNT,
} from './constants.js';
import {
  buildExtractionMessages,
  configPathCandidates,
  dedupeAgainst,
  fitToBudget,
  pickConfigs,
  type SampleFile,
  toCandidate,
  verifyCandidates,
} from './domain.js';
import type {
  CloneFileReader,
  ConventionSampler,
  ConventionStore,
  ExtractedSkillWriter,
  FeatureModelResolver,
  LlmResolver,
  RepoLookup,
  ScanLog,
} from './ports.js';

export interface ConventionsServiceDeps {
  store: ConventionStore;
  repos: RepoLookup;
  samples: ConventionSampler;
  readFile: CloneFileReader;
  llm: LlmResolver;
  model: FeatureModelResolver;
  writeSkill: ExtractedSkillWriter;
  scans: ScanLog;
}

/**
 * M2 Conventions Extractor. One run: code picks the files (configs + ranked
 * samples), the model is called once, code verifies every snippet against its
 * file and only verified candidates are stored. Accepted candidates become a
 * `convention` skill with source `extracted`.
 */
export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    await this.requireRepo(workspaceId, repoId);
    return this.listing(workspaceId, repoId);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clone_path) {
      throw new BadRequestError('repo_not_cloned', 'The repository is not cloned yet. Wait for the clone to finish, then re-scan.');
    }
    const files = await this.readSamples(repoId, repo.clone_path);
    if (files.length === 0) {
      throw new BadRequestError('no_samples', 'No source files to sample. Index the repository first (repo-intel), then re-scan.');
    }

    const choice = await this.deps.model(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildExtractionMessages(repo.full_name, files),
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
    });

    const existing = await this.deps.store.listByRepo(workspaceId, repoId);
    const acceptedRules = existing.filter((c) => c.status === 'accepted').map((c) => c.rule);
    const fresh = dedupeAgainst(verifyCandidates(res.data.candidates, files), acceptedRules);
    await this.deps.store.replaceUndecided(workspaceId, repoId, fresh);
    this.deps.scans.set(repoId, { sampleCount: files.length, at: new Date() });
    return this.listing(workspaceId, repoId);
  }

  async patch(workspaceId: string, repoId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate> {
    const current = await this.deps.store.getById(workspaceId, id);
    if (!current || current.repoId !== repoId) {
      throw new NotFoundError('Convention not found');
    }
    const updated = await this.deps.store.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule.trim() } : {}),
    });
    if (!updated) throw new NotFoundError('Convention not found');
    return toCandidate(updated);
  }

  /** Save the modal's draft as a skill. Every id must be an accepted candidate of this repo. */
  async createSkill(workspaceId: string, repoId: string, input: ConventionSkillInput): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const all = await this.deps.store.listByRepo(workspaceId, repoId);
    const byId = new Map(all.map((c) => [c.id, c]));
    const picked = input.convention_ids.map((id) => byId.get(id));
    if (picked.some((c) => !c || c.status !== 'accepted')) {
      throw new BadRequestError('convention_not_accepted', 'Only accepted conventions of this repository can go into a skill.');
    }
    const evidence = [...new Set(picked.map((c) => c!.evidencePath))];
    return this.deps.writeSkill(
      workspaceId,
      {
        name: input.name,
        description: input.description,
        type: 'convention',
        body: input.body,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
      evidence,
    );
  }

  private async readSamples(repoId: string, clonePath: string): Promise<SampleFile[]> {
    const samplePaths = await this.deps.samples(repoId, SAMPLE_FILE_COUNT);
    const configs = pickConfigs(await this.readAll(clonePath, configPathCandidates(samplePaths)));
    const sources = await this.readAll(clonePath, samplePaths);
    return fitToBudget([...configs, ...sources]);
  }

  private async readAll(clonePath: string, paths: readonly string[]): Promise<SampleFile[]> {
    const read = await Promise.all(
      paths.map(async (path) => ({ path, content: await this.deps.readFile(clonePath, path) })),
    );
    return read.flatMap((f) => (f.content === null || f.content.trim() === '' ? [] : [{ path: f.path, content: f.content }]));
  }

  private async listing(workspaceId: string, repoId: string): Promise<ConventionList> {
    const rows = await this.deps.store.listByRepo(workspaceId, repoId);
    const scan = this.deps.scans.get(repoId);
    const latest = rows.reduce<Date | null>((max, r) => (!max || r.createdAt > max ? r.createdAt : max), null);
    return {
      candidates: rows.map(toCandidate),
      sample_count: scan?.sampleCount ?? null,
      last_scan_at: (scan?.at ?? latest)?.toISOString() ?? null,
    };
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
