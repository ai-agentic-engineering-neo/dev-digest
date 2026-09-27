import type { Db } from '../../db/client.js';
import { isThirdPartySkill } from '@devdigest/shared';
import type {
  CommunitySkill,
  Skill,
  SkillAgentUsage,
  SkillImportPreview,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { toSkillAgentDto, toSkillDto, toSkillVersionDto } from './helpers.js';
import { ExtractError, previewFromUpload, skillCoreFromMarkdown } from './extract.js';
import { findCatalogEntry, searchCatalog } from './community.js';
import { MAX_BODY_CHARS, MAX_UPLOAD_BYTES } from './constants.js';

/** What the skills use cases need. The DI container satisfies this structurally. */
export interface SkillsDeps {
  readonly db: Db;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  note?: string;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string;
}

/** What the user confirmed in the import preview. */
export interface ImportCommitInput {
  name: string;
  description: string;
  type: SkillType;
  source: Extract<SkillSource, 'imported_url' | 'community'>;
  body: string;
}

/** Either an uploaded file or a catalog entry — both end in the same preview. */
export type ImportSource =
  | { filename: string; content_base64: string }
  | { community_id: string };

/**
 * Skills use cases: the reusable instruction blocks agents share.
 *
 * A skill is TEXT. Nothing here executes, fetches or schedules anything — the
 * only thing a skill can do is end up in a prompt, in an order the user chose.
 * The import path is the one place untrusted text enters, and it is deliberately
 * two-step: `previewImport` writes nothing, `importSkill` writes what the user
 * confirmed.
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(deps: SkillsDeps) {
    this.repo = new SkillsRepository(deps.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.agentCounts(rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.agentCounts([row.id]);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const body = this.assertBody(input.body);
    const source = input.source ?? 'manual';
    const row = await this.repo.insert(
      {
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source,
        body,
        // Third-party text arrives disabled whatever the caller asks for:
        // enabling somebody else's instructions is a decision, not a default.
        enabled: isThirdPartySkill(source) ? false : (input.enabled ?? true),
      },
      input.note,
    );
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    // Trim on the way in, exactly like create: otherwise an edit that only adds
    // a trailing newline would bump the version and snapshot an identical body.
    const body = patch.body !== undefined ? this.assertBody(patch.body) : undefined;
    const row = await this.repo.update(workspaceId, id, {
      ...patch,
      ...(body !== undefined ? { body } : {}),
    });
    if (!row) return undefined;
    const counts = await this.repo.agentCounts([row.id]);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Body history, newest first. Undefined = no such skill here (route → 404). */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Restore an old body by writing it as a NEW version. History stays
   * append-only, so a run trace that cites v3 keeps meaning what it meant.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return undefined;
    if (snapshot.body === skill.body) return this.get(workspaceId, id);
    await this.repo.update(workspaceId, id, {
      body: snapshot.body,
      note: `Restored v${version}`,
    });
    return this.get(workspaceId, id);
  }

  /** Agents that link this skill (Stats tab). Undefined = no such skill here. */
  async agentsUsing(workspaceId: string, id: string): Promise<SkillAgentUsage[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.agentsUsing(id);
    return rows.map(toSkillAgentDto);
  }

  /**
   * Persist a CONFIRMED preview. The provenance note and the source→enabled
   * rule live here, not in the route, so a second caller (a job, a test, a CLI)
   * commits an import the same way the HTTP client does.
   */
  async importSkill(workspaceId: string, confirmed: ImportCommitInput): Promise<Skill> {
    return this.create(workspaceId, {
      name: confirmed.name,
      description: confirmed.description,
      type: confirmed.type,
      body: confirmed.body,
      source: confirmed.source,
      note:
        confirmed.source === 'community'
          ? 'Imported from the community catalog'
          : 'Imported from a file',
    });
  }

  /** Bundled catalog search — no network call; see ./community.ts. */
  searchCommunity(q?: string, lang?: string): CommunitySkill[] {
    return searchCatalog(q, lang);
  }

  /**
   * Turn an upload or a catalog entry into a preview. Writes NOTHING: this is
   * the step where the user sees the exact text before it can reach an agent.
   */
  previewImport(input: ImportSource): SkillImportPreview {
    try {
      if ('community_id' in input) {
        const entry = findCatalogEntry(input.community_id);
        if (!entry) throw new ValidationError(`Unknown community skill "${input.community_id}"`);
        const core = skillCoreFromMarkdown(entry.body, `${entry.name}.md`);
        return {
          name: entry.name,
          description: entry.desc,
          type: entry.type,
          source: 'community',
          body: core.body,
          files_used: [`${entry.repo}/${entry.name}/SKILL.md`],
          files_skipped: [],
          warnings: [
            `Third-party skill from ${entry.repo}. Its text becomes part of your agent's prompt — read it before enabling.`,
          ],
        };
      }

      const buf = Buffer.from(input.content_base64, 'base64');
      if (buf.length === 0) throw new ValidationError('The uploaded file is empty.');
      if (buf.length > MAX_UPLOAD_BYTES) {
        throw new ValidationError(
          `Upload is ${buf.length} bytes (limit ${MAX_UPLOAD_BYTES}).`,
        );
      }
      const preview = previewFromUpload(input.filename, buf, 'imported_url');
      return {
        ...preview,
        warnings: [
          ...preview.warnings,
          "Imported text becomes part of your agent's prompt — read it before enabling.",
        ],
      };
    } catch (err) {
      if (err instanceof ExtractError) throw new ValidationError(err.message);
      throw err;
    }
  }

  private assertBody(body: string): string {
    const trimmed = body.trim();
    if (!trimmed) throw new ValidationError('Skill body cannot be empty.');
    if (trimmed.length > MAX_BODY_CHARS) {
      throw new ValidationError(
        `Skill body is ${trimmed.length} characters (limit ${MAX_BODY_CHARS}).`,
      );
    }
    return trimmed;
  }
}
