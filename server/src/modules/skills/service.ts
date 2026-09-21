import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillType, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import { parseSkillDocument, toSkillDto, toSkillVersionDto } from './helpers.js';
import { MAX_SKILL_BODY_CHARS } from './constants.js';

/**
 * Skills service — the reusable instruction blocks agents share.
 *
 * A skill is CONFIGURATION TEXT and nothing else: it is stored, versioned, and
 * eventually concatenated into a review prompt. Nothing here executes, renders,
 * or resolves anything out of a skill body, and no import path ever writes to
 * disk. That constraint is the whole security model of the feature.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Skill['source'];
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.agentCounts(workspaceId),
    ]);
    return rows.map((row) => toSkillDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row, counts] = await Promise.all([
      this.repo.getById(workspaceId, id),
      this.repo.agentCounts(workspaceId),
    ]);
    return row ? toSkillDto(row, counts.get(row.id) ?? 0) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    assertBodyWithinBudget(input.body);
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      // Imported skills default to OFF: someone else's instructions should not
      // silently join an agent's prompt just because the file parsed cleanly.
      enabled: input.enabled ?? (input.source ?? 'manual') === 'manual',
    });
    // A skill that does not exist yet cannot be linked to anything.
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    if (patch.body !== undefined) assertBodyWithinBudget(patch.body);
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) return undefined;
    const counts = await this.repo.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history, newest first. Workspace-scoped: returns undefined when the
   * skill isn't in this workspace (the route maps that to 404) so snapshots
   * can't be read across tenants.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Parse a pasted / uploaded document into a skill core. Persists NOTHING —
   * the user reviews the result and then issues a normal create. Splitting
   * preview from save is what makes "you are about to put someone else's
   * instructions into your agent's prompt" a decision instead of a side effect.
   *
   * `skippedEntries` is passed through from the client's archive extraction:
   * the members it refused to read (scripts, binaries). The server never sees
   * those bytes at all, which is precisely the point.
   */
  preview(input: {
    text: string;
    origin?: string;
    source?: Skill['source'];
    skippedEntries?: string[];
  }): SkillImportPreview {
    assertBodyWithinBudget(input.text);
    const parsed = parseSkillDocument(input.text);
    if (parsed.body.trim().length === 0) {
      throw new ValidationError('That document has no readable content to import.');
    }
    return {
      ...parsed,
      source: input.source ?? 'imported_file',
      origin: input.origin ?? null,
      skipped_entries: input.skippedEntries ?? [],
    };
  }

  /**
   * Fetch a markdown document from a user-supplied URL and preview it. The SSRF
   * / size / content-type guards live in the `WebFetcher` adapter, so this
   * method stays a two-step orchestration: fetch, then parse.
   */
  async previewFromUrl(url: string): Promise<SkillImportPreview> {
    let text: string;
    let origin: string;
    try {
      const doc = await this.container.webFetcher.fetchText(url);
      text = doc.text;
      origin = doc.url;
    } catch (err) {
      // Every failure here — a refused private address, a redirect, a timeout,
      // a wrong content type — is "the URL you gave doesn't work", so it maps
      // to 422 rather than a 5xx that would read as our bug. The guard's own
      // message is surfaced verbatim: it tells the user exactly what to fix.
      throw new ValidationError((err as Error).message);
    }
    return this.preview({ text, origin, source: 'imported_url' });
  }
}

function assertBodyWithinBudget(body: string): void {
  if (body.length > MAX_SKILL_BODY_CHARS) {
    throw new ValidationError(
      `Skill body is too large (${body.length} chars; limit ${MAX_SKILL_BODY_CHARS}). ` +
        'A skill is prepended to every review prompt that uses it.',
    );
  }
}
