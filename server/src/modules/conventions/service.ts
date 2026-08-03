import type { ConventionsList, Skill } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type { RepoRepository } from '../repos/repository.js';
import type { SkillsService } from '../skills/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { ConventionsRepository } from './repository.js';
import { getConventionsSampleSet, readClone, type ConventionsSampleSet } from './samples.js';
import { buildConventionsPrompt } from './prompts.js';
import { ConventionExtractionOutput, type ConventionExtractionCandidate } from './schemas.js';
import { findSnippetLines } from './evidence.js';
import { evidenceFilesFor, renderConventionsSkillBody, toConventionDto, toScanDto } from './helpers.js';

/**
 * Conventions Extractor application service.
 *
 *   extract  — code-only sampling (no model), one structured LLM call, then
 *              server-side evidence verification. Only verified candidates
 *              are persisted, always `status: 'pending'`.
 *   list     — the latest scan for a repo, plus its candidates.
 *   setStatus — accept/reject one candidate.
 *   createSkillFromConventions — merge ACCEPTED candidates (server-enforced,
 *              not just UI-enforced) into one skill via SkillsService, in
 *              process — no HTTP self-call.
 */

export interface CreateSkillFromConventionsInput {
  conventionIds: string[];
  name: string;
  description: string;
  enabled: boolean;
  /** Editable in the client modal before saving; the default (rule +
   *  evidence citation per candidate) is rendered when omitted. */
  body?: string;
}

interface VerifiedCandidate {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export class ConventionsService {
  constructor(
    private repo: ConventionsRepository,
    private repos: RepoRepository,
    private container: Container,
    private skills: SkillsService,
  ) {}

  async extract(workspaceId: string, repoId: string): Promise<ConventionsList> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const sample = await getConventionsSampleSet(this.container, repoRow);
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const { data } = await llm.completeStructured({
      model,
      schema: ConventionExtractionOutput,
      schemaName: 'ConventionExtraction',
      messages: buildConventionsPrompt(sample),
    });

    // `repoRow.clonePath` is guaranteed non-null here — `getConventionsSampleSet`
    // already threw if it were.
    const verified = await this.verify(repoRow.clonePath!, sample, data.candidates);

    const scan = await this.repo.insertScan({
      workspaceId,
      repoId,
      sampleFileCount: sample.configFiles.length + sample.sourceFiles.length,
      sourceSha: sample.sourceSha,
      model,
    });
    const rows = await this.repo.insertCandidates(
      verified.map((v) => ({ workspaceId, repoId, scanId: scan.id, ...v })),
    );

    return { scan: toScanDto(scan), candidates: rows.map(toConventionDto) };
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsList> {
    const scan = await this.repo.getLatestScan(workspaceId, repoId);
    if (!scan) return { scan: null, candidates: [] };
    const rows = await this.repo.listByScan(scan.id);
    return { scan: toScanDto(scan), candidates: rows.map(toConventionDto) };
  }

  async setStatus(workspaceId: string, id: string, status: 'accepted' | 'rejected') {
    const row = await this.repo.setStatus(workspaceId, id, status);
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Only rows already `status === 'accepted'` may be merged — enforced here,
   * not just by which candidates the UI happens to send, so a rejected
   * candidate can never end up in a skill body via a stale request.
   */
  async createSkillFromConventions(
    workspaceId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill> {
    const rows = await this.repo.getByIds(workspaceId, input.conventionIds);
    if (rows.length !== input.conventionIds.length) {
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

    const body = input.body ?? renderConventionsSkillBody(input.name, rows);
    return this.skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: 'convention',
      source: 'extracted',
      body,
      enabled: input.enabled,
      evidenceFiles: evidenceFilesFor(rows),
    });
  }

  /**
   * Drop any raw candidate whose evidence isn't real: file missing from the
   * clone, or snippet not found in that file. This is what makes "every
   * candidate has evidence that's real code" true by construction.
   */
  private async verify(
    clonePath: string,
    sample: ConventionsSampleSet,
    raw: ConventionExtractionCandidate[],
  ): Promise<VerifiedCandidate[]> {
    const sampled = new Map<string, string>();
    for (const f of [...sample.configFiles, ...sample.sourceFiles]) sampled.set(f.path, f.content);

    const out: VerifiedCandidate[] = [];
    for (const c of raw) {
      const content = sampled.get(c.evidence_path) ?? (await readClone(clonePath, c.evidence_path));
      if (content === null || content === undefined) continue;
      const range = findSnippetLines(content, c.evidence_snippet);
      if (!range) continue;
      out.push({
        category: c.category,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceStartLine: range.startLine,
        evidenceEndLine: range.endLine,
        evidenceSnippet: c.evidence_snippet,
        confidence: c.confidence,
      });
    }
    return out;
  }
}
