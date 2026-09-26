/**
 * skills — application service (ring 2).
 *
 * Business rules for reusable review skills: a skill is a named, typed block
 * of Markdown text that agents link (in order) and that the review prompt
 * renders under `## Skills / rules`. Depends on `SkillsDeps` (ports), never on
 * `Container`, Drizzle or fastify. Throws `AppError` subclasses; `app.ts`
 * turns them into the HTTP envelope.
 */
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_BODY_CHARS } from './constants.js';
import { diffSkillBodies, isMeaningfulChange } from './helpers.js';
import { extractSkillFromUpload } from './import.js';
import type { SkillVersionDiff } from '@devdigest/shared';
import type {
  CreateSkillInput,
  SkillDto,
  SkillImportPreview,
  SkillVersionDto,
  SkillsDeps,
  UpdateSkillInput,
} from './ports.js';

export class SkillsService {
  constructor(private readonly deps: SkillsDeps) {}

  list(workspaceId: string): Promise<SkillDto[]> {
    return this.deps.repo.list(workspaceId);
  }

  /** Lookup by name (workspace-scoped); undefined when absent. Used by the conventions extractor. */
  findByName(workspaceId: string, name: string): Promise<SkillDto | undefined> {
    return this.deps.repo.findByName(workspaceId, name);
  }

  async get(workspaceId: string, id: string): Promise<SkillDto> {
    const skill = await this.deps.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  /**
   * An imported skill always starts disabled, whatever the client sent: a
   * foreign body is foreign instructions in the prompt, so a human enables it
   * on the Skills page after reading it.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
    this.assertBodyFits(input.body);
    await this.assertNameFree(workspaceId, input.name);
    const enabled = input.source === 'imported_file' ? false : input.enabled;
    return this.deps.repo.create(workspaceId, { ...input, enabled });
  }

  /**
   * Metadata edits (name, description, type, enabled) never bump the version.
   * A body edit bumps it, unless the change is whitespace only, in which case
   * the body is left untouched.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<SkillDto> {
    const current = await this.get(workspaceId, id);
    if (patch.body !== undefined) this.assertBodyFits(patch.body);
    if (patch.name !== undefined && patch.name !== current.name) {
      await this.assertNameFree(workspaceId, patch.name);
    }

    const bodyChanged = patch.body !== undefined && isMeaningfulChange(current.body, patch.body);
    const effective: UpdateSkillInput = { ...patch };
    if (!bodyChanged) delete effective.body;
    // Nothing left to write (empty patch, or a whitespace-only body edit): an
    // empty Drizzle `set` would be a SQL syntax error, so answer with the row as is.
    if (Object.values(effective).every((v) => v === undefined)) return current;

    const next = await this.deps.repo.update(workspaceId, id, effective, { bumpVersion: bodyChanged });
    if (!next) throw new NotFoundError('Skill not found');
    return next;
  }

  /**
   * Import step 1 of 2: parse the upload into a preview. Nothing is saved; the
   * client shows the preview (with the ignored-files list and the trust note)
   * and calls `create` with `source: 'imported_file'` on confirmation.
   */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    // The route schema already guarantees well-formed base64.
    return extractSkillFromUpload(filename, new Uint8Array(Buffer.from(contentBase64, 'base64')));
  }

  /** Body history, newest first (404 for an unknown skill). */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersionDto[]> {
    await this.get(workspaceId, id);
    return this.deps.repo.listVersions(workspaceId, id);
  }

  /** Unified diff from `version` to the current body. */
  async diffVersion(workspaceId: string, id: string, version: number): Promise<SkillVersionDiff> {
    const current = await this.get(workspaceId, id);
    const from = await this.deps.repo.getVersion(workspaceId, id, version);
    if (!from) throw new NotFoundError('Skill version not found');
    const d = diffSkillBodies(current.name, from, current);
    return { skill_id: id, from_version: version, to_version: current.version, ...d };
  }

  /**
   * Restore: the chosen version's body becomes the current body as a NEW
   * version (history is never rewritten). Restoring the current body is a no-op.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<SkillDto> {
    const from = await this.deps.repo.getVersion(workspaceId, id, version);
    if (!from) throw new NotFoundError('Skill version not found');
    return this.update(workspaceId, id, { body: from.body });
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.delete(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  private assertBodyFits(body: string): void {
    if (body.length > MAX_BODY_CHARS) {
      throw new ValidationError(`Skill body exceeds ${MAX_BODY_CHARS} characters`, {
        length: body.length,
      });
    }
  }

  private async assertNameFree(workspaceId: string, name: string): Promise<void> {
    const clash = await this.deps.repo.findByName(workspaceId, name);
    if (clash) throw new ConflictError(`A skill named "${name}" already exists`, { name });
  }
}
