import { describe, it, expect } from 'vitest';
import {
  isBodyChange,
  toPercent,
  toRates,
  toSkillDto,
  toSkillStatsDto,
  toSkillVersionDto,
  EMPTY_USAGE,
} from '../src/modules/skills/helpers.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type {
  InsertSkill,
  SkillRecord,
  SkillsStore,
  SkillUsageCounts,
  SkillVersionRecord,
  UpdateSkill,
} from '../src/modules/skills/types.js';

const rec = (over: Partial<SkillRecord> = {}): SkillRecord => ({
  id: 's1',
  workspaceId: 'w1',
  name: 'Skill',
  description: 'desc',
  type: 'custom',
  source: 'manual',
  body: 'body',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('isBodyChange', () => {
  it('is true only when body is present and differs', () => {
    expect(isBodyChange({ body: 'a' }, { body: 'b' })).toBe(true);
    expect(isBodyChange({ body: 'a' }, { body: 'a' })).toBe(false);
    expect(isBodyChange({ body: 'a' }, {})).toBe(false);
  });

  it('ignores name/description/type/enabled edits', () => {
    expect(
      isBodyChange(
        { body: 'a' },
        { name: 'n', description: 'd', type: 'rubric', enabled: false },
      ),
    ).toBe(false);
  });
});

describe('toSkillDto / toSkillVersionDto', () => {
  it('maps camelCase to the snake_case contract', () => {
    expect(toSkillDto(rec({ evidenceFiles: ['a.ts'] }))).toEqual({
      id: 's1',
      name: 'Skill',
      description: 'desc',
      type: 'custom',
      source: 'manual',
      body: 'body',
      enabled: true,
      version: 1,
      evidence_files: ['a.ts'],
    });
    expect(toSkillDto(rec()).evidence_files).toBeNull();
  });

  it('serialises the version timestamp as ISO', () => {
    const v: SkillVersionRecord = {
      skillId: 's1',
      version: 2,
      body: 'b',
      createdAt: new Date('2026-02-03T04:05:06.000Z'),
    };
    expect(toSkillVersionDto(v)).toEqual({
      skill_id: 's1',
      version: 2,
      body: 'b',
      created_at: '2026-02-03T04:05:06.000Z',
    });
  });
});

describe('stats maths', () => {
  it('toPercent returns null on a zero denominator and rounds to one decimal', () => {
    expect(toPercent(0, 0)).toBeNull();
    expect(toPercent(5, 0)).toBeNull();
    expect(toPercent(0, 4)).toBe(0);
    expect(toPercent(1, 3)).toBe(33.3);
    expect(toPercent(2, 3)).toBe(66.7);
    expect(toPercent(3, 3)).toBe(100);
  });

  it('a skill with no history has null rates, zero counts', () => {
    expect(toRates(EMPTY_USAGE)).toEqual({ used_by: 0, pull_rate: null, accept_rate: null });
    expect(toSkillStatsDto(EMPTY_USAGE)).toEqual({
      used_by: 0,
      pull_rate: null,
      accept_rate: null,
      findings_30d: 0,
      agents_using: [],
      findings_by_category: [],
    });
  });

  it('derives pull / accept rates independently', () => {
    const c: SkillUsageCounts = {
      ...EMPTY_USAGE,
      usedBy: 2,
      pulledRuns: 1,
      eligibleRuns: 4,
      accepted: 0,
      decided: 0, // findings exist but none triaged yet → accept rate is "—"
    };
    expect(toRates(c)).toEqual({ used_by: 2, pull_rate: 25, accept_rate: null });
  });
});

/** Minimal in-memory store: enough to exercise the service's scoping/mapping. */
class FakeStore implements SkillsStore {
  rows: SkillRecord[] = [];
  versions: SkillVersionRecord[] = [];
  statsCalls: string[][] = [];
  stats = new Map<string, SkillUsageCounts>();

  async list(ws: string) {
    return this.rows.filter((r) => r.workspaceId === ws);
  }
  async getById(ws: string, id: string) {
    return this.rows.find((r) => r.workspaceId === ws && r.id === id);
  }
  async deleteById(ws: string, id: string) {
    const n = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.workspaceId === ws && r.id === id));
    return this.rows.length < n;
  }
  async insert(v: InsertSkill) {
    const row = rec({
      id: `s${this.rows.length + 1}`,
      workspaceId: v.workspaceId,
      name: v.name,
      description: v.description ?? '',
      type: v.type,
      source: v.source ?? 'manual',
      body: v.body,
      enabled: v.enabled ?? true,
    });
    this.rows.push(row);
    this.versions.push({ skillId: row.id, version: 1, body: row.body, createdAt: new Date() });
    return row;
  }
  async update(ws: string, id: string, p: UpdateSkill) {
    const row = await this.getById(ws, id);
    if (!row) return undefined;
    Object.assign(row, p);
    return row;
  }
  async listVersions(id: string) {
    return this.versions.filter((v) => v.skillId === id).sort((a, b) => b.version - a.version);
  }
  async getVersion(id: string, version: number) {
    return this.versions.find((v) => v.skillId === id && v.version === version);
  }
  async statsForSkills(ids: string[]) {
    this.statsCalls.push(ids);
    return new Map(ids.flatMap((id) => (this.stats.has(id) ? [[id, this.stats.get(id)!]] : [])));
  }
}

describe('SkillsService', () => {
  it('create defaults source=manual, enabled=true and returns the DTO', async () => {
    const store = new FakeStore();
    const svc = new SkillsService({ repo: store });
    const s = await svc.create('w1', { name: 'A', type: 'rubric', body: 'x' });
    expect(s).toMatchObject({ name: 'A', source: 'manual', enabled: true, version: 1 });
    const imported = await svc.create('w1', {
      name: 'B',
      type: 'rubric',
      body: 'x',
      source: 'extracted',
    });
    expect(imported.source).toBe('extracted');
  });

  it('list uses ONE batched stats call and merges rates; unknown skills get nulls', async () => {
    const store = new FakeStore();
    const svc = new SkillsService({ repo: store });
    const a = await svc.create('w1', { name: 'A', type: 'rubric', body: 'x' });
    const b = await svc.create('w1', { name: 'B', type: 'rubric', body: 'x' });
    await svc.create('w2', { name: 'other-tenant', type: 'rubric', body: 'x' });
    store.stats.set(a.id, {
      ...EMPTY_USAGE,
      usedBy: 3,
      pulledRuns: 1,
      eligibleRuns: 2,
      accepted: 1,
      decided: 4,
    });

    const list = await svc.list('w1');
    expect(store.statsCalls).toEqual([[a.id, b.id]]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: a.id, used_by: 3, pull_rate: 50, accept_rate: 25 });
    expect(list[1]).toMatchObject({ id: b.id, used_by: 0, pull_rate: null, accept_rate: null });
  });

  it('is workspace-scoped: every read/write on another tenant returns undefined/false', async () => {
    const store = new FakeStore();
    const svc = new SkillsService({ repo: store });
    const s = await svc.create('w1', { name: 'A', type: 'rubric', body: 'x' });

    expect(await svc.get('w2', s.id)).toBeUndefined();
    expect(await svc.update('w2', s.id, { name: 'hax' })).toBeUndefined();
    expect(await svc.listVersions('w2', s.id)).toBeUndefined();
    expect(await svc.getVersion('w2', s.id, 1)).toBeUndefined();
    expect(await svc.stats('w2', s.id)).toBeUndefined();
    expect(await svc.delete('w2', s.id)).toBe(false);

    expect(await svc.get('w1', s.id)).toMatchObject({ name: 'A' });
    expect(await svc.listVersions('w1', s.id)).toHaveLength(1);
    expect(await svc.getVersion('w1', s.id, 2)).toBeUndefined();
  });

  it('stats for a skill with no history: null rates, empty lists (no division by zero)', async () => {
    const store = new FakeStore();
    const svc = new SkillsService({ repo: store });
    const s = await svc.create('w1', { name: 'A', type: 'rubric', body: 'x' });
    expect(await svc.stats('w1', s.id)).toEqual({
      used_by: 0,
      pull_rate: null,
      accept_rate: null,
      findings_30d: 0,
      agents_using: [],
      findings_by_category: [],
    });
  });

  it('update only forwards the provided fields to the store', async () => {
    const store = new FakeStore();
    const svc = new SkillsService({ repo: store });
    const s = await svc.create('w1', { name: 'A', type: 'rubric', body: 'x' });
    const seen: UpdateSkill[] = [];
    const orig = store.update.bind(store);
    store.update = async (ws, id, p) => {
      seen.push(p);
      return orig(ws, id, p);
    };
    await svc.update('w1', s.id, { enabled: false });
    expect(seen).toEqual([{ enabled: false }]);
  });
});
