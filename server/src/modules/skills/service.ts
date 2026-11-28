import type {
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import {
  type ArchiveEntry,
  applyContent,
  assertEntryCount,
  assertEntrySize,
  assertRestorable,
  assertSafePaths,
  assertUploadSize,
  fallbackStem,
  importKind,
  isContentChange,
  isMarkdownEntry,
  mapFrontmatter,
  pickCoreFile,
  restoreNote,
  splitFrontmatter,
} from './domain.js';
import type {
  AgentLinks,
  ArchiveReader,
  EffectiveSkill,
  FrontmatterParser,
  SkillStore,
  StoredSkill,
  TokenCounter,
} from './ports.js';

/**
 * M2 — skills use cases: CRUD, version history, restore, and the two-step
 * import (preview parses and writes nothing; confirm saves like a create).
 * The database is the source of truth; a content change always writes a
 * version row.
 */

export interface SkillsServiceDeps {
  skills: SkillStore;
  tokens: TokenCounter;
  archive: ArchiveReader;
  frontmatter: FrontmatterParser;
  /** Agent links (agents module): `agent_count` and the run's link ids. */
  links: AgentLinks;
}

const utf8 = new TextDecoder('utf-8');

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    return this.withCounts(await this.deps.skills.list(workspaceId));
  }

  /** One skill with `token_count` (the body alone, not the rendered block). */
  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.withCount(await this.require(workspaceId, id));
    return { ...skill, token_count: this.deps.tokens.count(skill.body) };
  }

  /**
   * The skills a review of this agent loads: linked, enabled on the link and
   * enabled globally, in link order. The one entry point for the run executor,
   * read once per run.
   */
  async effectiveSkills(agentId: string): Promise<EffectiveSkill[]> {
    const ids = await this.deps.links.enabledSkillIds(agentId);
    if (ids.length === 0) return [];
    const byId = new Map((await this.deps.skills.enabledByIds(ids)).map((s) => [s.id, s]));
    return ids.flatMap((id) => {
      const skill = byId.get(id);
      return skill ? [skill] : [];
    });
  }

  /**
   * Create at v1 with `source = 'manual'` (or `imported_file` from the import
   * confirm, `extracted` from the conventions extractor with its evidence files).
   */
  async create(
    workspaceId: string,
    input: SkillInput,
    source: 'manual' | 'imported_file' | 'extracted' = 'manual',
    evidenceFiles?: string[],
  ): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const skill = await this.deps.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(evidenceFiles ? { evidenceFiles } : {}),
    });
    return { ...skill, agent_count: 0 };
  }

  /** The import's confirm step: the edited preview, saved as `imported_file`. */
  confirmImport(workspaceId: string, input: SkillInput): Promise<Skill> {
    return this.create(workspaceId, input, 'imported_file');
  }

  /**
   * A content change (name, description, type or body differs) bumps the
   * version and writes a version row with the note; an `enabled`-only or
   * same-value patch writes none.
   */
  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill> {
    const existing = await this.require(workspaceId, id);
    if (isContentChange(existing, patch)) {
      if (patch.name !== undefined && patch.name !== existing.name) {
        await this.assertNameFree(workspaceId, patch.name, id);
      }
      const updated = await this.deps.skills.bumpAndSnapshot(
        workspaceId,
        id,
        applyContent(existing, patch),
        patch.note ?? null,
        patch.enabled,
      );
      if (!updated) throw new NotFoundError('Skill not found');
      return this.withCount(updated);
    }
    if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
      return this.setEnabled(workspaceId, id, patch.enabled);
    }
    return this.withCount(existing);
  }

  async setEnabled(workspaceId: string, id: string, enabled: boolean): Promise<Skill> {
    const skill = await this.deps.skills.setEnabled(workspaceId, id, enabled);
    if (!skill) throw new NotFoundError('Skill not found');
    return this.withCount(skill);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.deps.skills.deleteById(workspaceId, id))) throw new NotFoundError('Skill not found');
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.require(workspaceId, id);
    return this.deps.skills.listVersions(id);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion> {
    await this.require(workspaceId, id);
    const v = await this.deps.skills.getVersion(id, version);
    if (!v) throw new NotFoundError('Skill version not found');
    return v;
  }

  /** Copy version `v` onto the skill as a new version; history is never rewritten. */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.require(workspaceId, id);
    const v = await this.deps.skills.getVersion(id, version);
    if (!v) throw new NotFoundError('Skill version not found');
    assertRestorable(skill, version);
    if (v.name !== skill.name) await this.assertNameFree(workspaceId, v.name, id);
    const restored = await this.deps.skills.bumpAndSnapshot(
      workspaceId,
      id,
      { name: v.name, description: v.description, type: v.type, body: v.body },
      restoreNote(version),
    );
    if (!restored) throw new NotFoundError('Skill not found');
    return this.withCount(restored);
  }

  /**
   * Parse an upload into an editable preview. Writes nothing to the database
   * or the disk; only the core `.md` entry is ever decompressed.
   */
  previewImport(req: SkillImportRequest): SkillImportPreview {
    const kind = importKind(req.filename);
    const data = Buffer.from(req.content_base64, 'base64');
    assertUploadSize(data.byteLength);

    if (kind === 'md') {
      assertEntrySize(req.filename, data.byteLength);
      return this.toPreview(utf8.decode(data), req.filename, fallbackStem(req.filename, req.filename), [], []);
    }

    let entries: ArchiveEntry[];
    try {
      entries = this.deps.archive.list(data);
    } catch {
      throw new BadRequestError('import_invalid_archive', 'The file is not a readable zip archive');
    }
    assertEntryCount(entries.length);
    assertSafePaths(entries);
    const core = pickCoreFile(entries);
    assertEntrySize(core.path, core.size);

    const files = entries.filter((e) => !e.isDirectory && e.path !== core.path);
    const skipped = files.map((e) => ({ path: e.path, size: e.size }));
    const extraMd = files.filter(isMarkdownEntry);
    const warnings =
      extraMd.length > 0
        ? [`${extraMd.length} other .md file(s) were not imported: ${extraMd.map((e) => e.path).join(', ')}`]
        : [];

    let bytes: Uint8Array;
    try {
      bytes = this.deps.archive.inflate(data, core.path);
    } catch {
      throw new BadRequestError('import_invalid_archive', `Could not decompress ${core.path}`);
    }
    assertEntrySize(core.path, bytes.byteLength);
    return this.toPreview(utf8.decode(bytes), core.path, fallbackStem(core.path, req.filename), skipped, warnings);
  }

  private toPreview(
    text: string,
    sourceFile: string,
    stem: string,
    skipped: SkillImportPreview['skipped_files'],
    warnings: string[],
  ): SkillImportPreview {
    const { yaml, body } = splitFrontmatter(text);
    let data: unknown = {};
    const all = [...warnings];
    if (yaml !== null) {
      try {
        data = this.deps.frontmatter.parse(yaml);
      } catch {
        all.push('The frontmatter is not valid YAML and was ignored');
      }
    }
    const fields = mapFrontmatter(data, stem);
    return {
      name: fields.name,
      description: fields.description,
      type: fields.type,
      body: body.replace(/^\s*\n/, ''),
      source_file: sourceFile,
      skipped_files: skipped,
      warnings: [...all, ...fields.warnings],
    };
  }

  /** Adds `agent_count` (agents linking the skill with the link enabled) from the agents module. */
  private async withCounts(skills: StoredSkill[]): Promise<Skill[]> {
    if (skills.length === 0) return [];
    const counts = await this.deps.links.enabledLinkCounts(skills.map((s) => s.id));
    return skills.map((s) => ({ ...s, agent_count: counts.get(s.id) ?? 0 }));
  }

  private async withCount(skill: StoredSkill): Promise<Skill> {
    const [counted] = await this.withCounts([skill]);
    return counted!;
  }

  private async require(workspaceId: string, id: string): Promise<StoredSkill> {
    const skill = await this.deps.skills.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string): Promise<void> {
    if (await this.deps.skills.nameTaken(workspaceId, name, exceptId)) {
      throw new BadRequestError('skill_name_taken', `A skill named "${name}" already exists`);
    }
  }
}
