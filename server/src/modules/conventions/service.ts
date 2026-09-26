/**
 * conventions — application service (ring 2). The HW2 Conventions Extractor:
 *
 *   extract()        pick samples in code (configs + top-N ranked files), enqueue
 *   runExtraction()  one cheap structured LLM call → verify every candidate's
 *                    evidence against the files we read → store the survivors
 *   decide()/edit()  accept / reject / edit a candidate (rejected survives a re-scan)
 *   skillDraft()     the `repo-conventions` skill the accepted rows would become
 *   createSkill()    save it (new skill, or a new version of the existing one)
 *                    and link it to an agent
 */
import { ConventionExtraction, type ConventionCandidate, type ConventionScan, type ConventionSkillDraft } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { EXTRACT_JOB_KIND, MAX_TOTAL_SAMPLE_CHARS, MIN_CONFIDENCE, SAMPLE_FILE_COUNT, STALE_SCAN_MS } from './constants.js';
import {
  buildExtractionMessages,
  buildSkillDraft,
  configCandidates,
  truncateSample,
  verifyEvidence,
  type Sample,
} from './helpers.js';
import type { CandidatePatch, ConventionsDeps, CreateConventionSkillInput, ExtractJobPayload } from './ports.js';

export class ConventionsService {
  constructor(private readonly deps: ConventionsDeps) {
    deps.jobs.register(EXTRACT_JOB_KIND, (payload) => this.runExtraction(payload as ExtractJobPayload));
  }

  async view(workspaceId: string, repoId: string): Promise<{ scan: ConventionScan | null; candidates: ConventionCandidate[] }> {
    await this.repoOr404(workspaceId, repoId);
    const [scan, candidates] = await Promise.all([
      this.deps.repo.getLatestScan(workspaceId, repoId),
      this.deps.repo.listCandidates(workspaceId, repoId),
    ]);
    return { scan: scan ?? null, candidates };
  }

  /** Start a scan (Run Scan / Re-scan). Returns the running scan; a scan already running is returned as is. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.repoOr404(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Repository is not cloned yet; add it and wait for the clone to finish');
    const latest = await this.deps.repo.getLatestScan(workspaceId, repoId);
    if (latest?.status === 'running') {
      const age = Date.now() - Date.parse(latest.started_at);
      if (age < STALE_SCAN_MS) return latest;
      // Orphaned by a crash or a hung provider call: close it and start over.
      await this.deps.repo.finishScan(workspaceId, latest.id, {
        status: 'failed',
        sampleCount: 0,
        candidatesFound: 0,
        candidatesKept: 0,
        error: `Scan did not finish within ${Math.round(STALE_SCAN_MS / 60_000)} minutes and was abandoned`,
      });
    }
    const model = await this.deps.featureModel(workspaceId);
    let scan: ConventionScan;
    try {
      scan = await this.deps.repo.createScan(workspaceId, repoId, model);
    } catch (err) {
      // Partial unique index `convention_scans_one_running_uidx`: a concurrent
      // request already started one; hand that scan back instead of a 500.
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
        const running = await this.deps.repo.getLatestScan(workspaceId, repoId);
        if (running?.status === 'running') return running;
      }
      throw err;
    }
    const payload: ExtractJobPayload = { workspaceId, repoId, scanId: scan.id };
    await this.deps.jobs.enqueue(workspaceId, EXTRACT_JOB_KIND, payload);
    return scan;
  }

  /** The background half. Never throws: the scan row records success or the error. */
  async runExtraction({ workspaceId, repoId, scanId }: ExtractJobPayload): Promise<void> {
    let sampleCount = 0;
    try {
      const repo = await this.repoOr404(workspaceId, repoId);
      const samples = await this.collectSamples(repo);
      sampleCount = samples.length;
      if (samples.length === 0) throw new ValidationError('No readable sample files; index the repository first');
      const { provider, model } = await this.deps.featureModel(workspaceId);
      const llm = await this.deps.llm(provider);
      this.deps.log?.(`conventions: extracting from ${samples.length} sample(s) with ${provider}/${model}`, { repoId, scanId });
      const result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        messages: buildExtractionMessages(repo.fullName, samples),
        temperature: 0,
        sessionId: `conventions:${repo.fullName}:${scanId}`,
      });
      const files = new Map(samples.map((s) => [s.path, s.content]));
      const found = result.data.candidates;
      const kept = found
        .filter((c) => c.confidence >= MIN_CONFIDENCE)
        .map((c) => verifyEvidence(c, files))
        .filter((c): c is NonNullable<typeof c> => !!c);
      const written = await this.deps.repo.replaceCandidates(
        workspaceId,
        repoId,
        scanId,
        kept.map((c) => ({
          category: c.category,
          rule: c.rule.trim(),
          evidencePath: c.evidence_path,
          evidenceLine: c.evidence_line,
          evidenceSnippet: c.evidence_snippet,
          confidence: c.confidence,
        })),
      );
      await this.deps.repo.finishScan(workspaceId, scanId, {
        status: 'done',
        sampleCount,
        candidatesFound: found.length,
        candidatesKept: written,
      });
      this.deps.log?.(`conventions: ${found.length} candidate(s) returned, ${written} kept after evidence check`, { repoId, scanId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log?.(`conventions: extraction failed — ${message}`, { repoId, scanId });
      await this.deps.repo.finishScan(workspaceId, scanId, { status: 'failed', sampleCount, candidatesFound: 0, candidatesKept: 0, error: message });
    }
  }

  /**
   * Sample selection, all in code: the config files that exist (root and each
   * sampled top-level folder) plus the top-N ranked source files from repo-intel.
   * Unreadable paths are skipped; text is capped per file and in total.
   */
  async collectSamples(repo: { id: string; owner: string; name: string }): Promise<Sample[]> {
    const ranked = await this.deps.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    const paths = [...configCandidates(ranked), ...ranked];
    const seen = new Set<string>();
    const out: Sample[] = [];
    let total = 0;
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      let content: string;
      try {
        content = await this.deps.git.readFile({ owner: repo.owner, name: repo.name }, path);
      } catch {
        continue;
      }
      if (!content.trim()) continue;
      const text = truncateSample(content);
      if (total + text.length > MAX_TOTAL_SAMPLE_CHARS) break;
      total += text.length;
      out.push({ path, content: text });
    }
    return out;
  }

  async decide(workspaceId: string, id: string, patch: CandidatePatch): Promise<ConventionCandidate> {
    if (patch.rule !== undefined && !patch.rule.trim()) throw new ValidationError('rule must not be empty');
    const row = await this.deps.repo.updateCandidate(workspaceId, id, {
      ...patch,
      ...(patch.rule !== undefined ? { rule: patch.rule.trim() } : {}),
    });
    if (!row) throw new NotFoundError('Convention candidate not found');
    return row;
  }

  async deselectAll(workspaceId: string, repoId: string): Promise<{ updated: number }> {
    await this.repoOr404(workspaceId, repoId);
    return { updated: await this.deps.repo.deselectAll(workspaceId, repoId) };
  }

  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.repoOr404(workspaceId, repoId);
    const accepted = (await this.deps.repo.listCandidates(workspaceId, repoId)).filter((c) => c.status === 'accepted');
    if (accepted.length === 0) throw new ValidationError('Accept at least one candidate first');
    const draft = buildSkillDraft(repo.fullName, accepted);
    const existing = await this.deps.skills.findByName(workspaceId, draft.name);
    return { ...draft, accepted_count: accepted.length, existing_skill_id: existing?.id ?? null };
  }

  /**
   * Save the (edited) draft as a skill with source `extracted` and link it to
   * the chosen agent. A skill with that name already in the workspace gets a
   * new version instead of a 409, so re-scans refresh `repo-conventions`.
   */
  async createSkill(workspaceId: string, repoId: string, input: CreateConventionSkillInput) {
    await this.repoOr404(workspaceId, repoId);
    const existing = await this.deps.skills.findByName(workspaceId, input.name);
    const skill = existing
      ? await this.deps.skills.update(workspaceId, existing.id, {
          description: input.description,
          type: input.type,
          body: input.body,
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        })
      : await this.deps.skills.create(workspaceId, {
          name: input.name,
          description: input.description,
          type: input.type,
          body: input.body,
          enabled: input.enabled ?? true,
          source: 'extracted',
        });
    const linked = await this.deps.agents.linkSkill(workspaceId, input.agent_id, skill.id);
    if (linked === undefined) throw new NotFoundError('Agent not found');
    return { skill, updated_existing: !!existing };
  }

  private async repoOr404(workspaceId: string, repoId: string) {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}

