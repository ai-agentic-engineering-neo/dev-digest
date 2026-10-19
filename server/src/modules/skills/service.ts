import type {
  Skill,
  SkillCreateBody,
  SkillIgnoredFile,
  SkillImportPreview,
  SkillStats,
  SkillUpdateBody,
  SkillVersion,
} from '@devdigest/shared';
import type { ArchiveReader, SkillStore } from './ports.js';
import {
  SkillDomainError,
  buildImportPreview,
  classifyIgnored,
  isJunk,
  pickCorePath,
} from './domain.js';
import { NO_USAGE, toSkillDto, toSkillStatsDto, toSkillVersionDto } from './helpers.js';
import { ARCHIVE_LIMITS, MAX_IMPORT_BYTES } from './constants.js';

export interface SkillsDeps {
  store: SkillStore;
  archive: ArchiveReader;
}

/**
 * L02 — skills use cases: CRUD with immutable body versions, and a stateless
 * import preview (nothing is saved until the user confirms via `create`).
 */
export class SkillsService {
  constructor(private readonly deps: SkillsDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, usage] = await Promise.all([
      this.deps.store.list(workspaceId),
      this.deps.store.usage(workspaceId),
    ]);
    return rows.map((r) => toSkillDto(r, usage.get(r.id) ?? NO_USAGE));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const r = await this.deps.store.get(workspaceId, id);
    return r && toSkillDto(r);
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.deps.store.get(workspaceId, id);
    if (!skill) return undefined;
    return toSkillStatsDto(await this.deps.store.usageDetail(workspaceId, id));
  }

  async create(workspaceId: string, input: SkillCreateBody): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const source = input.source ?? 'manual';
    const r = await this.deps.store.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source,
      // A foreign skill is foreign instructions in the agent's prompt: imported
      // skills start disabled until the user vets and enables them.
      enabled: source === 'imported' ? false : (input.enabled ?? true),
      ...(input.evidence_files?.length ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(r);
  }

  /** Body change → new immutable version (with the optional change note); other fields edit in place. */
  async update(workspaceId: string, id: string, patch: SkillUpdateBody): Promise<Skill | undefined> {
    const existing = await this.deps.store.get(workspaceId, id);
    if (!existing) return undefined;
    if (patch.name !== undefined && patch.name !== existing.name) {
      await this.assertNameFree(workspaceId, patch.name);
    }
    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const r = await this.deps.store.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      bodyChanged ? { body: patch.body!, message: patch.version_message || null } : undefined,
    );
    return r && toSkillDto(r);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.delete(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.deps.store.get(workspaceId, id);
    if (!skill) return undefined;
    return (await this.deps.store.listVersions(id)).map(toSkillVersionDto);
  }

  /**
   * Parse an uploaded `.md` or `.zip` into an editable preview. Only the core
   * markdown is ever decompressed/read; every other archive entry is listed by
   * path (code as `executable`) and never touched — nothing runs, nothing is
   * written to disk, nothing is persisted.
   */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    const data = Buffer.from(contentBase64, 'base64');
    if (data.length === 0) throw new SkillDomainError('skill_import_invalid', 'The file is empty');
    if (data.length > MAX_IMPORT_BYTES) {
      throw new SkillDomainError('skill_import_invalid', `The file is larger than ${MAX_IMPORT_BYTES} bytes`);
    }

    const lower = filename.toLowerCase();
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return buildImportPreview(filename, decodeText(data), []);
    }
    if (!lower.endsWith('.zip')) {
      throw new SkillDomainError('skill_import_invalid', 'Upload a .md file or a .zip archive');
    }

    let entries;
    try {
      entries = this.deps.archive.list(data, ARCHIVE_LIMITS).filter((e) => !e.isDirectory && !isJunk(e.path));
    } catch (err) {
      throw new SkillDomainError('skill_import_invalid', (err as Error).message);
    }
    const corePath = pickCorePath(entries.map((e) => e.path));
    const core = entries.find((e) => e.path === corePath)!;
    let markdown: string;
    try {
      markdown = decodeText(core.read());
    } catch (err) {
      throw new SkillDomainError('skill_import_invalid', (err as Error).message);
    }
    const ignored: SkillIgnoredFile[] = entries
      .filter((e) => e.path !== corePath)
      .map((e) => ({ path: e.path, reason: classifyIgnored(e.path) }));
    return buildImportPreview(corePath, markdown, ignored);
  }

  private async assertNameFree(workspaceId: string, name: string): Promise<void> {
    if (await this.deps.store.findByName(workspaceId, name)) {
      throw new SkillDomainError('skill_name_taken', `A skill named "${name}" already exists`);
    }
  }
}

function decodeText(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new SkillDomainError('skill_import_invalid', 'The skill file is not valid UTF-8 text');
  }
}
