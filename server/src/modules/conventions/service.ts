import { readFile, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, sep } from 'node:path';
import type { Container } from '../../platform/container.js';
import type {
  ConventionCandidate,
  ConventionList,
  ConventionSkillPreview,
  SkillType,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  ConventionsRepository,
  type ConventionRow,
  type ConventionScanRow,
  type NewCandidate,
} from './repository.js';
import type { Skill } from '@devdigest/shared';
import {
  buildConventionsSkillBody,
  capSamplesForPrompt,
  EXCLUDED_DIRS,
  isConfigFileName,
  toConventionCandidateDto,
  toConventionScanDto,
  toSkillDto,
  verifyEvidence,
  type SampleFile,
} from './helpers.js';
import { buildExtractionMessages, ConventionExtraction } from './prompt.js';

const RANKED_SAMPLE_COUNT = 12;
const MAX_CONFIG_FILES = 20;
const MAX_DIRS_WALKED = 2000;
const DEFAULT_SKILL_NAME = 'repo-conventions';

export interface CreateConventionsSkillInput {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  replace_skill_id?: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** GET /repos/:id/conventions — undefined when the repo isn't in this workspace (C9). */
  async get(workspaceId: string, repoId: string): Promise<ConventionList | undefined> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) return undefined;
    const [scan, candidates] = await Promise.all([
      this.repo.getLatestScan(workspaceId, repoId),
      this.repo.listNonRejected(workspaceId, repoId),
    ]);
    return {
      scan: scan ? toConventionScanDto(scan) : null,
      repo: { full_name: repoRow.fullName },
      candidates: candidates.map(toConventionCandidateDto),
    };
  }

  /**
   * POST /repos/:id/conventions/extract — C1-C6. Undefined when the repo
   * isn't in this workspace; throws AppError('repo_not_ready', ..., 409)
   * when it has no clone or nothing indexed yet (C10).
   */
  async extract(
    workspaceId: string,
    repoId: string,
  ): Promise<{ list: ConventionList; dropped: number } | undefined> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) return undefined;
    if (!repoRow.clonePath) {
      throw new AppError('repo_not_ready', 'Repo is not cloned yet', 409);
    }

    const clonePath = repoRow.clonePath;
    const configPaths = await findConfigFilePaths(clonePath);
    const rankedPaths = await this.container.repoIntel.getConventionSamples(
      repoId,
      RANKED_SAMPLE_COUNT,
    );
    const candidatePaths = dedupe([...configPaths, ...rankedPaths]);
    if (candidatePaths.length === 0) {
      throw new AppError('repo_not_ready', 'Repo is not indexed yet', 409);
    }

    const read = await Promise.all(
      candidatePaths.map(async (path) => ({ path, content: await readClone(clonePath, path) })),
    );
    const rawFiles: SampleFile[] = read.filter(
      (f): f is SampleFile => f.content != null,
    ) as SampleFile[];
    const finalFiles = capSamplesForPrompt(rawFiles);
    const contentByPath = new Map(finalFiles.map((f) => [f.path, f.content]));
    const sampledPaths = finalFiles.map((f) => f.path);

    const { provider, model } = await this.container.resolveFeatureModel(workspaceId, 'conventions');
    const sha = await this.container.git.currentHead({ owner: repoRow.owner, name: repoRow.name });

    let extraction: ConventionExtraction;
    try {
      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        messages: buildExtractionMessages(finalFiles),
        timeoutMs: 90_000,
      });
      extraction = result.data;
    } catch (err) {
      await this.repo.insertFailedScan({
        workspaceId,
        repoId,
        sha,
        model,
        provider,
        status: 'failed',
        sampleFiles: sampledPaths,
        candidatesFound: 0,
        candidatesDropped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      const list = await this.get(workspaceId, repoId);
      return { list: list!, dropped: 0 };
    }

    const verified: NewCandidate[] = [];
    let dropped = 0;
    for (const c of extraction.candidates) {
      const evidence = verifyEvidence(c.evidence, {
        sampledPaths,
        clonePath,
        fileContent: contentByPath.get(c.evidence.path) ?? null,
      });
      if (!evidence) {
        dropped += 1;
        continue;
      }
      verified.push({
        category: c.category,
        rule: c.rule,
        evidencePath: evidence.path,
        evidenceStartLine: evidence.startLine,
        evidenceEndLine: evidence.endLine,
        evidenceSnippet: evidence.snippet,
        confidence: c.confidence,
      });
    }

    await this.repo.runScan(
      {
        workspaceId,
        repoId,
        sha,
        model,
        provider,
        status: 'ok',
        sampleFiles: sampledPaths,
        candidatesFound: verified.length,
        candidatesDropped: dropped,
      },
      verified,
    );

    const list = await this.get(workspaceId, repoId);
    return { list: list!, dropped };
  }

  /** PATCH /conventions/:id — status/rule/category only; evidence is immutable. */
  async patchCandidate(
    workspaceId: string,
    id: string,
    patch: { status?: 'pending' | 'accepted' | 'rejected'; rule?: string; category?: string },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateCandidate(workspaceId, id, patch);
    return row ? toConventionCandidateDto(row) : undefined;
  }

  /** POST /repos/:id/conventions/skill/preview — writes nothing. */
  async previewSkill(workspaceId: string, repoId: string): Promise<ConventionSkillPreview | undefined> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) return undefined;
    const accepted = await this.repo.getAccepted(workspaceId, repoId);
    const body = buildConventionsSkillBody(
      DEFAULT_SKILL_NAME,
      repoRow.fullName,
      accepted.map(toSkillBodyCandidate),
    );
    const existing = await this.container.skillsRepo.list(workspaceId);
    const clash = existing.find((s) => s.name === DEFAULT_SKILL_NAME);
    return {
      name: DEFAULT_SKILL_NAME,
      description: `House conventions for ${repoRow.fullName}, extracted from the repo.`,
      type: 'convention',
      body,
      accepted_count: accepted.length,
      name_taken_by: clash?.id ?? null,
    };
  }

  /**
   * POST /repos/:id/conventions/skill — C7/C8. With `replace_skill_id`, a
   * normal S4 update (existing skill, version+1, via the shared
   * `skillsRepo` — the same repository the skills module itself uses);
   * otherwise a new skill (version 1, `source: 'extracted'`). Never links
   * the new/updated skill to an agent.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionsSkillInput,
  ): Promise<Skill | undefined> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) return undefined;
    const accepted = await this.repo.getAccepted(workspaceId, repoId);
    const evidenceFiles = dedupe(accepted.map((c) => c.evidencePath).filter((p): p is string => !!p));

    if (input.replace_skill_id) {
      const skill = await this.container.skillsRepo.update(workspaceId, input.replace_skill_id, {
        name: input.name,
        description: input.description,
        type: input.type,
        body: input.body,
        enabled: input.enabled,
        note: 'Extracted from conventions',
      });
      if (!skill) throw new NotFoundError('Skill not found');
      return toSkillDto(skill);
    }

    const skill = await this.container.skillsRepo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'extracted',
      body: input.body,
      enabled: input.enabled,
      note: 'Extracted from conventions',
      evidenceFiles,
    });
    return toSkillDto(skill);
  }
}

function toSkillBodyCandidate(row: ConventionRow) {
  return {
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine ?? 0,
    evidence_end_line: row.evidenceEndLine ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
  };
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

const EXCLUDED_SET = new Set<string>(EXCLUDED_DIRS);

/** C1 — recursively find config files in the clone (bounded walk, no fs writes). */
async function findConfigFilePaths(clonePath: string): Promise<string[]> {
  const out: string[] = [];
  let dirsWalked = 0;

  async function walk(dir: string, relDir: string): Promise<void> {
    if (dirsWalked >= MAX_DIRS_WALKED || out.length >= MAX_CONFIG_FILES) return;
    dirsWalked += 1;
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_CONFIG_FILES) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_SET.has(entry.name)) continue;
        await walk(join(dir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isConfigFileName(entry.name)) {
        out.push((relDir ? `${relDir}/${entry.name}` : entry.name).split(sep).join('/'));
      }
    }
  }

  await walk(clonePath, '');
  return out;
}
