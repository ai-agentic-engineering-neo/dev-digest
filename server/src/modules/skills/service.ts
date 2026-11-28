import type {
  ConfirmSkillImportInput,
  CreateSkillInput,
  Skill,
  SkillImportPreview,
  SkillPreviewBlock,
  SkillStats,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { renderSkillBlock } from '@devdigest/reviewer-core';
import { ArchiveError } from '../../adapters/archive/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  INITIAL_CHANGE_NOTE,
  LARGE_SKILL_TOKENS,
  MAX_MD_BYTES,
  MAX_ZIP_BYTES,
  STATS_WINDOW_DAYS,
  restoredNote,
} from './constants.js';
import { acceptRate, pullRate, toSkillDto, toSkillVersionDto } from './helpers.js';
import {
  fallbackNameFor,
  isSkillEntryCandidate,
  parseSkillMarkdown,
  pickSkillEntry,
} from './import/parse.js';
import type { SkillRecord, SkillsServiceDeps } from './types.js';

/**
 * M2 — skills service. Reusable, text-only review instructions: CRUD with
 * body versioning, the exact prompt block an agent receives, usage stats, and
 * a two-step import (preview → explicit trust → save). Nothing in an imported
 * file is ever executed; only SKILL.md / a loose .md is read.
 */
export class SkillsService {
  private readonly now: () => Date;

  constructor(private deps: SkillsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private since(): Date {
    return new Date(this.now().getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }

  private async require(workspaceId: string, id: string): Promise<SkillRecord> {
    const skill = await this.deps.skills.get(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  private async assertNameFree(workspaceId: string, name: string, selfId?: string) {
    const clash = await this.deps.skills.getByName(workspaceId, name);
    if (clash && clash.id !== selfId) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const [skills, usage] = await Promise.all([
      this.deps.skills.list(workspaceId),
      this.deps.skills.usageSummaries(workspaceId, this.since()),
    ]);
    const byId = new Map(usage.map((u) => [u.skillId, u]));
    return skills.map((s) => toSkillDto(s, byId.get(s.id)));
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.require(workspaceId, id);
    const [usage] = await this.deps.skills.usageSummaries(workspaceId, this.since(), id);
    return toSkillDto(skill, usage);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const skill = await this.deps.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
      changeNote: INITIAL_CHANGE_NOTE,
    });
    return toSkillDto(skill);
  }

  async update(workspaceId: string, id: string, input: UpdateSkillInput): Promise<Skill> {
    await this.require(workspaceId, id);
    if (input.name !== undefined) await this.assertNameFree(workspaceId, input.name, id);
    const updated = await this.deps.skills.update(workspaceId, id, {
      name: input.name,
      description: input.description,
      type: input.type,
      enabled: input.enabled,
      ...(input.body !== undefined
        ? { body: { text: input.body, changeNote: input.change_note || null } }
        : {}),
    });
    if (!updated) throw new NotFoundError('Skill not found');
    return this.get(workspaceId, id);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.skills.delete(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  /** The block exactly as it is appended to an agent's system message. */
  async preview(workspaceId: string, id: string): Promise<SkillPreviewBlock> {
    const skill = await this.require(workspaceId, id);
    const block = renderSkillBlock({ name: skill.name, body: skill.body });
    return { block, tokens: this.deps.tokenizer.count(block) };
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    await this.require(workspaceId, id);
    const since = this.since();
    const [[usage], usedBy, byCategory] = await Promise.all([
      this.deps.skills.usageSummaries(workspaceId, since, id),
      this.deps.skills.usedBy(id),
      this.deps.skills.findingsByCategory(id, since),
    ]);
    return {
      used_by: usedBy.map((a) => ({ agent_id: a.agentId, name: a.name })),
      pull_rate: usage ? pullRate(usage) : null,
      accept_rate: usage ? acceptRate(usage) : null,
      findings_30d: usage?.findings ?? 0,
      by_category: byCategory,
    };
  }

  async versions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    const skill = await this.require(workspaceId, id);
    const rows = await this.deps.skills.listVersions(id);
    return rows.map((v) => toSkillVersionDto(v, skill.version, false));
  }

  async version(workspaceId: string, id: string, version: number): Promise<SkillVersion> {
    const skill = await this.require(workspaceId, id);
    const row = await this.deps.skills.getVersion(id, version);
    if (!row) throw new NotFoundError('Skill version not found');
    return toSkillVersionDto(row, skill.version, true);
  }

  /** Restore = a NEW version carrying vK's body; history is never rewritten. */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.require(workspaceId, id);
    const row = await this.deps.skills.getVersion(id, version);
    if (!row) throw new NotFoundError('Skill version not found');
    if (row.body === skill.body) {
      throw new ValidationError(`v${version} is identical to the current body`);
    }
    await this.deps.skills.update(workspaceId, id, {
      body: { text: row.body, changeNote: restoredNote(version) },
    });
    return this.get(workspaceId, id);
  }

  /**
   * Step 1 of import: parse an uploaded .md / .zip into an editable preview.
   * Persists NOTHING. For a zip only SKILL.md (root or one folder deep) is
   * decompressed; every other entry is reported as skipped, never read.
   */
  importPreview(fileName: string, data: Uint8Array): SkillImportPreview {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.md')) {
      if (data.byteLength > MAX_MD_BYTES) throw new ValidationError('Markdown file is larger than 256 KB');
      const text = decodeUtf8(data);
      return this.toPreview(parseSkillMarkdown(text, fileName), fileName, []);
    }
    if (lower.endsWith('.zip')) {
      if (data.byteLength > MAX_ZIP_BYTES) throw new ValidationError('Archive is larger than 5 MB');
      let listing;
      try {
        listing = this.deps.archive.readZip(data, isSkillEntryCandidate);
      } catch (err) {
        if (err instanceof ArchiveError) throw new ValidationError(err.message);
        throw err;
      }
      const entry = pickSkillEntry(Object.keys(listing.texts));
      if (!entry) {
        const why = listing.rejected.length
          ? `SKILL.md was refused (${listing.rejected.map((r) => r.reason).join(', ')})`
          : 'No SKILL.md found at the archive root or one folder deep';
        throw new ValidationError(why);
      }
      const parsed = parseSkillMarkdown(listing.texts[entry]!, fallbackNameFor(entry, fileName));
      const skipped = listing.entries.filter((e) => e !== entry);
      return this.toPreview(parsed, entry, skipped);
    }
    throw new ValidationError('Only .md and .zip files can be imported');
  }

  private toPreview(
    parsed: ReturnType<typeof parseSkillMarkdown>,
    sourceFile: string,
    skipped: string[],
  ): SkillImportPreview {
    const warnings = [...parsed.warnings];
    const tokens = this.deps.tokenizer.count(parsed.body);
    if (tokens > LARGE_SKILL_TOKENS) {
      warnings.push(`Large skill: ~${tokens} tokens will be added to every review prompt.`);
    }
    if (skipped.length > 0) {
      warnings.push(`${skipped.length} other file(s) in the archive were ignored — they are never read or run.`);
    }
    return {
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      body: parsed.body,
      source_file: sourceFile,
      skipped_files: skipped,
      warnings,
    };
  }

  /** Step 2 of import: the user reviewed the preview and trusts it → save. */
  async confirmImport(workspaceId: string, input: ConfirmSkillImportInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const skill = await this.deps.skills.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'imported_file',
      body: input.body,
      enabled: true,
      changeNote: 'Imported from file',
    });
    return toSkillDto(skill);
  }
}

function decodeUtf8(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new ValidationError('The file is not valid UTF-8 text');
  }
}
