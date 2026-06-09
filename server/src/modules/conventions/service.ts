import type { Container } from '../../platform/container.js';
import type { ConventionCandidate } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsRepository } from './repository.js';
import { SkillsService } from '../skills/service.js';
import { toCandidate, conventionSkillBody } from './helpers.js';
import { ACCEPTED_SKILL_NAME_MAX_LEN } from './constants.js';
import { runExtraction } from './extract-pipeline.js';

/**
 * A1 — conventions extractor (§7 L02).
 *
 * Flow (2-step, LLM-driven file selection, ONE conversation):
 *   1. Build a compact REPO MAP locally (paths + symbols via CodeIndex) — no LLM.
 *   2. Step 1 call: send the map, the model picks the files it wants (FileSelection).
 *   3. Read the picked files (validated against the map, within a byte budget).
 *   4. Step 2 call (same dialogue): send the full file bodies → Extraction.
 * The repo content is always UNTRUSTED data (never instructions). Each candidate
 * carries evidence_path + evidence_snippet + confidence; accepting one creates a
 * `convention` Skill (source='extracted', type='convention'). Falls back to a
 * heuristic file sample if the model's selection yields nothing.
 *
 * All external work routes through container adapters (CodeIndex / GitClient /
 * LLMProvider). No process.env, no direct SDK construction.
 *
 * Schemas/prompt/tunables live in constants.ts; grounding + DTO mapping in
 * helpers.ts; the 2-step mining pipeline in extract-pipeline.ts.
 */

export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toCandidate);
  }

  /** 2-step LLM-driven extraction (see class header) → persist fresh candidates. */
  async extract(
    workspaceId: string,
    repoId: string,
    opts: { provider?: 'openai' | 'anthropic'; model?: string } = {},
  ): Promise<ConventionCandidate[]> {
    return runExtraction(this.container, this.repo, workspaceId, repoId, opts);
  }

  /** Accept a candidate → mark accepted AND create an extracted convention Skill. */
  async accept(workspaceId: string, conventionId: string): Promise<{ skillId: string }> {
    const row = await this.repo.getById(workspaceId, conventionId);
    if (!row) throw new NotFoundError('Convention not found');
    await this.repo.markAccepted(workspaceId, conventionId);

    const skill = await this.skills.create(workspaceId, {
      name: row.rule.slice(0, ACCEPTED_SKILL_NAME_MAX_LEN),
      description: row.rule,
      type: 'convention',
      source: 'extracted',
      body: conventionSkillBody(row.rule, row.evidencePath, row.evidenceSnippet),
      enabled: true,
      evidenceFiles: row.evidencePath ? [row.evidencePath] : null,
    });
    return { skillId: skill.id };
  }
}
