/**
 * skills — service unit test. Lives at `server/test/skills-service.test.ts`.
 * Hermetic: an in-memory fake of the port, no container, no Docker.
 */
import { describe, expect, it } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type { CreateSkillInput, SkillDto, SkillsRepositoryPort } from '../src/modules/skills/ports.js';

class InMemorySkillsRepo implements SkillsRepositoryPort {
  rows: SkillDto[] = [];
  versions: Array<{ id: string; version: number; body: string }> = [];

  async list(workspaceId: string) {
    return this.rows.filter((r) => r.id.startsWith(workspaceId));
  }
  async getById(workspaceId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.id.startsWith(workspaceId));
  }
  async create(workspaceId: string, input: CreateSkillInput) {
    const row: SkillDto = {
      id: `${workspaceId}:${this.rows.length + 1}`,
      source: 'manual',
      enabled: true,
      version: 1,
      created_at: new Date(0).toISOString(),
      ...input,
    };
    this.rows.push(row);
    return row;
  }
  async saveNewVersion(workspaceId: string, id: string, body: string) {
    const row = await this.getById(workspaceId, id);
    if (!row) return undefined;
    row.body = body;
    row.version += 1;
    this.versions.push({ id, version: row.version, body });
    return row;
  }
}

const WS = 'ws-1';
const input: CreateSkillInput = { name: 'Rubric', description: '', type: 'rubric', body: 'Check nulls.' };

describe('SkillsService', () => {
  it('creates and lists within the workspace', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    await svc.create(WS, input);
    expect(await svc.list(WS)).toHaveLength(1);
    expect(await svc.list('ws-2')).toHaveLength(0);
  });

  it('bumps the version only on a meaningful body change', async () => {
    const repo = new InMemorySkillsRepo();
    const svc = new SkillsService({ repo });
    const created = await svc.create(WS, input);
    const same = await svc.updateBody(WS, created.id, '  Check nulls.\n');
    expect(same.version).toBe(1);
    const changed = await svc.updateBody(WS, created.id, 'Check nulls and undefined.');
    expect(changed.version).toBe(2);
    expect(repo.versions).toHaveLength(1);
  });

  it('rejects an oversized body with a 422 AppError', async () => {
    const svc = new SkillsService({ repo: new InMemorySkillsRepo() });
    await expect(svc.create(WS, { ...input, body: 'x'.repeat(50_001) })).rejects.toMatchObject({
      statusCode: 422,
      code: 'validation_error',
    });
  });

  it('404s on an unknown id', async () => {
    const svc = new SkillsService({ repo: new InMemorySkillsRepo() });
    await expect(svc.get(WS, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});
