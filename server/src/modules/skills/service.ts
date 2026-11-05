import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ValidationError } from '../../platform/errors.js';
import { skillBodyProblem, skillNameProblem } from '../_shared/skill-name.js';
import {
  STATS_WINDOW_DAYS,
  computeSkillStats,
  type SkillCardStats,
  type SkillImportPreview,
  type SkillStats,
} from './domain.js';
import { buildImportPreview } from './import/skill-import.js';
import type { SkillPatch, SkillVersionRecord } from './ports.js';

/**
 * Skills service — reusable, text-only prompt blocks shared across agents.
 * The DB is the source of truth. Imports are two-step: preview (parse only,
 * nothing saved) → confirm (re-parse the same upload server-side and save as
 * an untrusted `community` skill), so what is stored is exactly what was shown.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** Note for v1 (default "Initial version"). */
  note?: string;
}

export interface ImportSkillInput {
  filename: string;
  content_base64: string;
  /** User edits from the preview step (metadata only — the body is re-parsed). */
  name?: string;
  description?: string;
  type?: SkillType;
}

class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

function assertName(name: string): void {
  const problem = skillNameProblem(name);
  if (problem) throw new ValidationError(problem);
}

function assertBody(body: string): void {
  const problem = skillBodyProblem(body);
  if (problem) throw new ValidationError(problem);
}

function decodeUpload(contentBase64: string): Buffer {
  const buf = Buffer.from(contentBase64, 'base64');
  if (buf.length === 0) throw new ValidationError('The uploaded file is empty or not base64');
  return buf;
}

export class SkillsService {
  constructor(private deps: Pick<Container, 'skillsRepo'>) {}

  private get repo() {
    return this.deps.skillsRepo;
  }

  list(workspaceId: string): Promise<Skill[]> {
    return this.repo.list(workspaceId);
  }

  get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.repo.getById(workspaceId, id);
  }

  usage(workspaceId: string): Promise<Record<string, number>> {
    return this.repo.linkCounts(workspaceId);
  }

  versions(workspaceId: string, id: string): Promise<SkillVersionRecord[] | undefined> {
    return this.repo.listVersions(workspaceId, id);
  }

  private async assertNameFree(workspaceId: string, name: string, selfId?: string): Promise<void> {
    const clash = await this.repo.getByName(workspaceId, name);
    if (clash && clash.id !== selfId) throw new ConflictError(`A skill named "${name}" already exists`);
  }

  /** Create a workspace-authored (trusted) skill. */
  create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return this.insertValidated(workspaceId, input, 'manual');
  }

  private async insertValidated(
    workspaceId: string,
    input: CreateSkillInput,
    source: SkillSource,
  ): Promise<Skill> {
    assertName(input.name);
    assertBody(input.body);
    await this.assertNameFree(workspaceId, input.name);
    return this.repo.insert({ workspaceId, source, ...input });
  }

  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill | undefined> {
    if (patch.name !== undefined) {
      assertName(patch.name);
      await this.assertNameFree(workspaceId, patch.name, id);
    }
    if (patch.body !== undefined) assertBody(patch.body);
    return this.repo.update(workspaceId, id, patch);
  }

  private statsSince(): Date {
    return new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }

  /** Stats tab: usage, pull / accept rate, findings by category over the last 30 days. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    if (!(await this.repo.getById(workspaceId, id))) return undefined;
    const [data, usedBy] = await Promise.all([
      this.repo.statsData(workspaceId, this.statsSince()),
      this.repo.linkedAgents(workspaceId, id),
    ]);
    return { ...computeSkillStats(id, data), used_by: usedBy, window_days: STATS_WINDOW_DAYS };
  }

  /** Card numbers for every skill of the workspace (one data load). */
  async listStats(workspaceId: string): Promise<Record<string, SkillCardStats>> {
    const [skills, data] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.statsData(workspaceId, this.statsSince()),
    ]);
    return Object.fromEntries(
      skills.map((sk) => {
        const st = computeSkillStats(sk.id, data);
        return [sk.id, { agents: st.agents, pull_rate: st.pull_rate, accept_rate: st.accept_rate }];
      }),
    );
  }

  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.delete(workspaceId, id);
  }

  /** Parse an upload into a preview. Nothing is persisted. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    return buildImportPreview(filename, decodeUpload(contentBase64));
  }

  /** Confirm an import: re-parse the upload, apply metadata edits, save as untrusted. */
  async importSkill(workspaceId: string, input: ImportSkillInput): Promise<Skill> {
    const preview = buildImportPreview(input.filename, decodeUpload(input.content_base64));
    const name = input.name ?? preview.name;
    const description = (input.description ?? preview.description).trim();
    if (!description) throw new ValidationError('Description is required — describe when to apply the skill');
    // Third-party content → `community` source → untrusted in the prompt.
    return this.insertValidated(
      workspaceId,
      { name, description, type: input.type ?? preview.type, body: preview.body },
      'community',
    );
  }
}
