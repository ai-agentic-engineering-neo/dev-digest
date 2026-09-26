/**
 * skills — service unit test. Hermetic: an in-memory fake of the port, no
 * container, no Docker. Covers the rules the service owns: name uniqueness,
 * body-size cap, version bump only on a meaningful body change, 404s.
 */
import { describe, expect, it, vi } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type {
  CreateSkillInput,
  SkillDto,
  SkillsRepositoryPort,
  UpdateSkillInput,
} from '../src/modules/skills/ports.js';

class InMemorySkillsRepo implements SkillsRepositoryPort {
  rows: Array<SkillDto & { ws: string }> = [];
  versions: Array<{ id: string; version: number; body: string }> = [];

  async list(workspaceId: string) {
    return this.rows.filter((r) => r.ws === workspaceId);
  }
  async getById(workspaceId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.ws === workspaceId);
  }
  async findByName(workspaceId: string, name: string) {
    return this.rows.find((r) => r.name === name && r.ws === workspaceId);
  }
  async create(workspaceId: string, input: CreateSkillInput) {
    const row = {
      ws: workspaceId,
      id: `sk-${this.rows.length + 1}`,
      version: 1,
      evidence_files: null,
      ...input,
      source: input.source ?? ('manual' as const),
      enabled: input.enabled ?? true,
    };
    this.rows.push(row);
    this.versions.push({ id: row.id, version: 1, body: row.body });
    return row;
  }
  async update(workspaceId: string, id: string, patch: UpdateSkillInput, opts: { bumpVersion: boolean }) {
    const row = await this.getById(workspaceId, id);
    if (!row) return undefined;
    Object.assign(row, patch);
    if (opts.bumpVersion) {
      row.version += 1;
      this.versions.push({ id, version: row.version, body: row.body });
    }
    return row;
  }
  async delete(workspaceId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && r.ws === workspaceId));
    return this.rows.length < before;
  }
}

const WS = 'ws-1';
const input: CreateSkillInput = {
  name: 'pr-quality-rubric',
  description: 'Baseline bar',
  type: 'rubric',
  body: 'Check nulls.',
};

describe('SkillsService', () => {
  it('creates and lists within the workspace', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    const created = await svc.create(WS, input);
    expect(created).toMatchObject({ source: 'manual', enabled: true, version: 1 });
    expect(await svc.list(WS)).toHaveLength(1);
    expect(await svc.list('ws-2')).toHaveLength(0);
  });

  it('rejects a duplicate name in the same workspace with 409, allows it elsewhere', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    await svc.create(WS, input);
    await expect(svc.create(WS, input)).rejects.toMatchObject({ statusCode: 409, code: 'conflict' });
    await expect(svc.create('ws-2', input)).resolves.toMatchObject({ name: input.name });
  });

  it('bumps the version only on a meaningful body change', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    const created = await svc.create(WS, input);

    const same = await svc.update(WS, created.id, { body: '  Check nulls.\n' });
    expect(same.version).toBe(1);
    expect(same.body).toBe('Check nulls.'); // whitespace-only edit is dropped

    const meta = await svc.update(WS, created.id, { description: 'Renamed', enabled: false });
    expect(meta.version).toBe(1);
    expect(meta).toMatchObject({ description: 'Renamed', enabled: false });

    const changed = await svc.update(WS, created.id, { body: 'Check nulls and undefined.' });
    expect(changed.version).toBe(2);
    expect(repo.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('renaming onto another skill is a 409; renaming to itself is fine', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    const a = await svc.create(WS, input);
    await svc.create(WS, { ...input, name: 'other-rule' });
    await expect(svc.update(WS, a.id, { name: 'other-rule' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.update(WS, a.id, { name: a.name, description: 'x' })).resolves.toMatchObject({
      description: 'x',
    });
  });

  it('an empty patch or a whitespace-only body edit returns the row unchanged without a write', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    const created = await svc.create(WS, input);
    const spy = vi.spyOn(repo, 'update');
    expect(await svc.update(WS, created.id, {})).toEqual(created);
    expect(await svc.update(WS, created.id, { body: ` ${input.body}\n` })).toEqual(created);
    expect(spy).not.toHaveBeenCalled();
  });

  it('an imported skill is created disabled even when the client says enabled', async () => {
    const svc = new SkillsService({ repo: new InMemorySkillsRepo() });
    const imported = await svc.create(WS, { ...input, source: 'imported_file', enabled: true });
    expect(imported).toMatchObject({ source: 'imported_file', enabled: false });
    const manual = await svc.create(WS, { ...input, name: 'manual-one', enabled: true });
    expect(manual.enabled).toBe(true);
  });

  it('rejects an oversized body with a 422 AppError', async () => {
    const svc = new SkillsService({ repo: new InMemorySkillsRepo() });
    await expect(svc.create(WS, { ...input, body: 'x'.repeat(50_001) })).rejects.toMatchObject({
      statusCode: 422,
      code: 'validation_error',
    });
  });

  it('404s on an unknown id for get, update and delete', async () => {
    const svc = new SkillsService({ repo: new InMemorySkillsRepo() });
    await expect(svc.get(WS, 'missing')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.update(WS, 'missing', { body: 'b' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.delete(WS, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});
