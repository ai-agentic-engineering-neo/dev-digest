import type {
  ConventionCandidate,
  ConventionsList,
  CreateSkillFromConventionsRequest,
  SetConventionStatus,
  Skill,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertCandidate } from './repository.js';
import { getConventionsSampleSet, readClone, type ConventionsSampleSet } from './samples.js';
import { buildConventionsPrompt } from './prompts.js';
import { ConventionExtractionOutput, type ConventionExtractionCandidate } from './schemas.js';
import { findSnippetLines } from './evidence.js';
import { EXTRACTION_SCHEMA_NAME } from './constants.js';
import {
  evidenceFilesFor,
  renderConventionsSkillBody,
  toConventionDto,
  toScanDto,
} from './helpers.js';

/**
 * Conventions Extractor.
 *   extract     code-only sampling, ONE structured LLM call, then server-side
 *               evidence verification — only verified candidates are stored.
 *   list        the latest scan for a repo + its candidates.
 *   setStatus   accept / reject one candidate.
 *   createSkill merge ACCEPTED candidates (enforced here, not only in the UI)
 *               into one `convention` skill via SkillsService, in process.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsList> {
    const repo = await this.getRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ValidationError(
        'Repo has not been cloned yet — refresh it before extracting conventions',
      );
    }
    const clonePath = repo.clonePath;

    const sample = await getConventionsSampleSet(this.container.repoIntel, {
      id: repo.id,
      clonePath,
    });
    if (sample.sourceFiles.length === 0) {
      throw new ValidationError('No source files found to sample in this repo');
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const { data } = await llm.completeStructured({
      model,
      schema: ConventionExtractionOutput,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildConventionsPrompt(sample),
    });

    const verified = await verifyCandidates(clonePath, sample, data.candidates);
    const sourceSha = await this.container.git.currentHead({ owner: repo.owner, name: repo.name });

    const saved = await this.repo.insertScan(
      {
        workspaceId,
        repoId,
        sampleFileCount: sample.configFiles.length + sample.sourceFiles.length,
        sourceSha,
        model,
      },
      verified,
    );
    return { scan: toScanDto(saved.scan), candidates: saved.candidates.map(toConventionDto) };
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsList> {
    await this.getRepo(workspaceId, repoId);
    const scan = await this.repo.getLatestScan(workspaceId, repoId);
    if (!scan) return { scan: null, candidates: [] };
    const rows = await this.repo.listByScan(workspaceId, scan.id);
    return { scan: toScanDto(scan), candidates: rows.map(toConventionDto) };
  }

  async setStatus(
    workspaceId: string,
    repoId: string,
    id: string,
    status: SetConventionStatus['status'],
  ): Promise<ConventionCandidate> {
    const row = await this.repo.setStatus(workspaceId, repoId, id, status);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsRequest,
  ): Promise<Skill> {
    const repo = await this.getRepo(workspaceId, repoId);
    const ids = [...new Set(input.convention_ids)];
    const rows = await this.repo.getByIds(workspaceId, repoId, ids);
    if (rows.length !== ids.length) {
      throw new ValidationError('One or more conventions were not found', {
        field: 'convention_ids',
      });
    }
    const notAccepted = rows.filter((r) => r.status !== 'accepted');
    if (notAccepted.length > 0) {
      throw new ValidationError('Only accepted conventions can be merged into a skill', {
        field: 'convention_ids',
        ids: notAccepted.map((r) => r.id),
      });
    }

    // Keep the caller's order (the order cards were shown in), not DB order.
    const byId = new Map(rows.map((r) => [r.id, toConventionDto(r)]));
    const candidates = ids.map((id) => byId.get(id)!);
    return this.container.skillsService.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: 'convention',
      source: 'extracted',
      body: input.body ?? renderConventionsSkillBody(input.name, repo.name, candidates),
      enabled: input.enabled,
      evidenceFiles: evidenceFilesFor(candidates),
    });
  }

  private async getRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.repoRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }
}

/**
 * Drop any candidate whose evidence isn't real: file missing from the clone,
 * or snippet not found in it. Line numbers come from the match, never the model.
 */
async function verifyCandidates(
  clonePath: string,
  sample: ConventionsSampleSet,
  raw: ConventionExtractionCandidate[],
): Promise<InsertCandidate[]> {
  const sampled = new Map<string, string>();
  for (const f of [...sample.configFiles, ...sample.sourceFiles]) sampled.set(f.path, f.content);

  const out: InsertCandidate[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const content = sampled.get(c.evidence_path) ?? (await readClone(clonePath, c.evidence_path));
    if (content === null) continue;
    const range = findSnippetLines(content, c.evidence_snippet);
    if (!range) continue;
    const key = c.rule.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      category: c.category.trim(),
      rule: c.rule.trim(),
      evidencePath: c.evidence_path,
      evidenceStartLine: range.startLine,
      evidenceEndLine: range.endLine,
      evidenceSnippet: c.evidence_snippet.trim(),
      confidence: c.confidence,
    });
  }
  return out;
}
