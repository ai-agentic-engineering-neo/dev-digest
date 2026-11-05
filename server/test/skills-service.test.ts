import { describe, it, expect, beforeEach } from 'vitest';
import type { Skill } from '@devdigest/shared';
import { SkillsService } from '../src/modules/skills/service.js';
import {
  computeSkillStats,
  isSkillContentChange,
  isTrustedSkillSource,
  toSkillSlug,
  versionNote,
} from '../src/modules/skills/domain.js';
import type { NewSkill, SkillPatch, SkillsRepositoryPort } from '../src/modules/skills/ports.js';
import { toSkillInputs } from '../src/modules/reviews/helpers.js';
import { AppError, ValidationError } from '../src/platform/errors.js';
import { MAX_SKILL_BODY_CHARS } from '../src/modules/skills/constants.js';

/** In-memory SkillsRepositoryPort — enough to test the service rules without Docker. */
class FakeSkillsRepo implements SkillsRepositoryPort {
  rows: (Skill & { workspaceId: string })[] = [];
  private seq = 0;
  async list(ws: string) {
    return this.rows.filter((r) => r.workspaceId === ws);
  }
  async getById(ws: string, id: string) {
    return this.rows.find((r) => r.workspaceId === ws && r.id === id);
  }
  async getByName(ws: string, name: string) {
    return this.rows.find((r) => r.workspaceId === ws && r.name === name);
  }
  async insert(v: NewSkill) {
    const row = {
      id: `s${++this.seq}`,
      workspaceId: v.workspaceId,
      name: v.name,
      description: v.description,
      type: v.type,
      source: v.source,
      body: v.body,
      enabled: v.enabled ?? true,
      version: 1,
      evidence_files: null,
    };
    this.rows.push(row);
    return row;
  }
  async update(ws: string, id: string, patch: SkillPatch) {
    const row = await this.getById(ws, id);
    if (!row) return undefined;
    const bump = isSkillContentChange(row, patch);
    Object.assign(row, patch, bump ? { version: row.version + 1 } : {});
    return row;
  }
  async delete() {
    return true;
  }
  async listVersions() {
    return [];
  }
  async promptSkillsForAgent() {
    return [];
  }
  async linkCounts() {
    return {};
  }
  async recordRunSkills() {}
  async statsData() {
    return { runs: [], runSkills: [], links: [], findings: [] };
  }
  async linkedAgents() {
    return [];
  }
}

const WS = 'ws-1';
const md = (s: string) => Buffer.from(s).toString('base64');

describe('skills domain', () => {
  it('only workspace-authored sources are trusted', () => {
    expect(isTrustedSkillSource('manual')).toBe(true);
    expect(isTrustedSkillSource('extracted')).toBe(true);
    expect(isTrustedSkillSource('community')).toBe(false);
    expect(isTrustedSkillSource('imported_url')).toBe(false);
  });

  it('enabled toggles do not count as a content change', () => {
    const base = { name: 'a', description: 'd', type: 'rubric' as const, body: 'b' };
    expect(isSkillContentChange(base, {})).toBe(false);
    expect(isSkillContentChange(base, { body: 'b' })).toBe(false);
    expect(isSkillContentChange(base, { body: 'b2' })).toBe(true);
    expect(isSkillContentChange(base, { type: 'custom' })).toBe(true);
  });

  it('slugifies names', () => {
    expect(toSkillSlug('My Skill.md')).toBe('my-skill');
    expect(toSkillSlug('__')).toBe('');
  });
});

describe('version notes', () => {
  it('uses the trimmed note, else a default for v1 / later versions', () => {
    expect(versionNote('  Added Tests dimension ', false)).toBe('Added Tests dimension');
    expect(versionNote(undefined, true)).toBe('Initial version');
    expect(versionNote('   ', false)).toBe('Updated');
    expect(versionNote('x'.repeat(300), false)).toHaveLength(200);
  });
});

describe('computeSkillStats', () => {
  const data = {
    runs: [
      { id: 'r1', agentId: 'agA' },
      { id: 'r2', agentId: 'agA' }, // skill disabled at that time → not in the prompt
      { id: 'r3', agentId: 'agB' }, // agB unlinked later, but r3 included the skill
      { id: 'r4', agentId: 'agC' }, // unrelated agent
    ],
    runSkills: [
      { runId: 'r1', skillId: 's1' },
      { runId: 'r3', skillId: 's1' },
      { runId: 'r4', skillId: 's2' },
    ],
    links: [
      { skillId: 's1', agentId: 'agA' },
      { skillId: 's2', agentId: 'agC' },
    ],
    findings: [
      { runId: 'r1', category: 'security', accepted: true, dismissed: false },
      { runId: 'r1', category: 'bug', accepted: false, dismissed: true },
      { runId: 'r3', category: 'security', accepted: false, dismissed: false }, // undecided
      { runId: 'r4', category: 'style', accepted: true, dismissed: false }, // other skill
    ],
  };

  it('pull = included ÷ eligible runs; accept = accepted ÷ decided; categories by count', () => {
    expect(computeSkillStats('s1', data)).toEqual({
      agents: 1,
      pull_rate: 2 / 3,
      accept_rate: 1 / 2,
      runs_30d: 2,
      findings_30d: 3,
      by_category: [
        { category: 'security', count: 2 },
        { category: 'bug', count: 1 },
      ],
    });
  });

  it('no runs / no decisions → null rates', () => {
    expect(computeSkillStats('zz', data)).toMatchObject({ agents: 0, pull_rate: null, accept_rate: null });
  });
});

describe('toSkillInputs (review executor)', () => {
  it('keeps order; trusted → headed block, imported → untrusted object', () => {
    const out = toSkillInputs([
      { name: 'a', body: ' rule A \n', trusted: true },
      { name: 'b', body: 'rule B', trusted: false },
    ]);
    expect(out).toEqual(['### a\nrule A', { name: 'b', body: 'rule B', trusted: false }]);
  });
});

describe('SkillsService', () => {
  let repo: FakeSkillsRepo;
  let service: SkillsService;
  beforeEach(() => {
    repo = new FakeSkillsRepo();
    service = new SkillsService({ skillsRepo: repo });
  });

  const input = { name: 'no-then-chains', description: 'Use on TS.', type: 'convention' as const, body: 'Use await.' };

  it('creates manual (trusted) skills', async () => {
    const s = await service.create(WS, input);
    expect(s.source).toBe('manual');
    expect(s.version).toBe(1);
  });

  it('rejects non-kebab names, empty bodies and duplicate names (409)', async () => {
    await expect(service.create(WS, { ...input, name: 'Bad Name' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.create(WS, { ...input, body: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await service.create(WS, input);
    await expect(service.create(WS, input)).rejects.toMatchObject({ statusCode: 409 });
    // same name in another workspace is fine
    await expect(service.create('ws-2', input)).resolves.toBeDefined();
  });

  it('enforces MAX_SKILL_BODY_CHARS on manual create and update, not only on import', async () => {
    const tooLong = 'x'.repeat(MAX_SKILL_BODY_CHARS + 1);
    await expect(service.create(WS, { ...input, body: tooLong })).rejects.toBeInstanceOf(ValidationError);
    const s = await service.create(WS, { ...input, body: 'x'.repeat(MAX_SKILL_BODY_CHARS) });
    await expect(service.update(WS, s.id, { body: tooLong })).rejects.toBeInstanceOf(ValidationError);
  });

  it('renaming onto another skill conflicts, renaming to itself does not', async () => {
    const a = await service.create(WS, input);
    const b = await service.create(WS, { ...input, name: 'other' });
    await expect(service.update(WS, b.id, { name: a.name })).rejects.toBeInstanceOf(AppError);
    await expect(service.update(WS, a.id, { name: a.name, body: 'new' })).resolves.toMatchObject({ version: 2 });
  });

  it('import preview saves nothing; confirm saves as untrusted community skill with edited metadata', async () => {
    const file = { filename: 'retry.md', content_base64: md('---\nname: retry-rules\n---\nRetry with backoff.') };
    const preview = service.previewImport(file.filename, file.content_base64);
    expect(preview.name).toBe('retry-rules');
    expect(repo.rows).toHaveLength(0);

    await expect(service.importSkill(WS, file)).rejects.toThrow(/Description is required/);

    const saved = await service.importSkill(WS, { ...file, description: 'Use on network code.', type: 'rubric' });
    expect(saved).toMatchObject({
      name: 'retry-rules',
      source: 'community',
      type: 'rubric',
      body: 'Retry with backoff.',
      description: 'Use on network code.',
    });
  });

  it('rejects an empty / non-base64 upload', () => {
    expect(() => service.previewImport('a.md', '!!!')).toThrow(ValidationError);
  });
});
