import { describe, it, expect } from 'vitest';
import { ZipArchiveReader } from '../src/adapters/archive/zip.js';
import { SkillsService } from '../src/modules/skills/service.js';
import {
  SkillDomainError,
  classifyIgnored,
  parseFrontmatter,
  pickCorePath,
} from '../src/modules/skills/domain.js';
import { formatSkillForPrompt } from '../src/modules/_shared/skill-prompt.js';
import type { SkillRecord, SkillStore } from '../src/modules/skills/ports.js';
import { makeZip } from './helpers/zip.js';

/**
 * L02 — skill import is a trust boundary: only the SKILL.md core is ever read,
 * code in the archive is listed and never touched, and nothing is persisted
 * by the preview. Plus the CRUD version rule with an in-memory store.
 */

const SKILL_MD = `---
name: flaky-tests
description: Use when tests touch time. Flag real clocks.
type: rubric
allowed-tools: Bash(scripts/x.sh)
---
# Flaky tests

Flag real time.
`;

class MemoryStore implements SkillStore {
  rows: SkillRecord[] = [];
  versions: { skillId: string; version: number; body: string; message: string | null; createdAt: Date }[] = [];
  async list(ws: string) {
    return this.rows.filter((r) => r.workspaceId === ws);
  }
  async get(ws: string, id: string) {
    return this.rows.find((r) => r.workspaceId === ws && r.id === id);
  }
  async findByName(ws: string, name: string) {
    return this.rows.find((r) => r.workspaceId === ws && r.name === name);
  }
  async insert(s: Parameters<SkillStore['insert']>[0]) {
    const r: SkillRecord = { ...s, id: `id-${this.rows.length}`, version: 1, evidenceFiles: null, createdAt: new Date() };
    this.rows.push(r);
    this.versions.push({ skillId: r.id, version: 1, body: r.body, message: null, createdAt: new Date() });
    return r;
  }
  async update(
    ws: string,
    id: string,
    patch: Parameters<SkillStore['update']>[2],
    next?: Parameters<SkillStore['update']>[3],
  ) {
    const r = await this.get(ws, id);
    if (!r) return undefined;
    Object.assign(r, patch);
    if (next !== undefined) {
      r.body = next.body;
      r.version += 1;
      this.versions.push({ skillId: id, version: r.version, body: next.body, message: next.message, createdAt: new Date() });
    }
    return r;
  }
  async delete() {
    return true;
  }
  async listVersions(id: string) {
    return this.versions.filter((v) => v.skillId === id).reverse();
  }
  async usage() {
    return new Map();
  }
  async usageDetail(): ReturnType<SkillStore['usageDetail']> {
    throw new Error('not used');
  }
}

function service(store = new MemoryStore()) {
  return { store, svc: new SkillsService({ store, archive: new ZipArchiveReader() }) };
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64');

describe('parseFrontmatter', () => {
  it('reads key/value pairs, quotes and folded blocks', () => {
    const { attrs, body } = parseFrontmatter(
      `---\nname: "a"\ndescription: >\n  line one\n  line two\n---\nBody`,
    );
    expect(attrs).toEqual({ name: 'a', description: 'line one line two' });
    expect(body).toBe('Body');
  });

  it('treats a file without frontmatter as all body', () => {
    expect(parseFrontmatter('# Just text')).toEqual({ attrs: {}, body: '# Just text' });
  });
});

describe('pickCorePath / classifyIgnored', () => {
  it('prefers SKILL.md at root or in the single top-level folder', () => {
    expect(pickCorePath(['x/README.md', 'x/SKILL.md', 'x/scripts/a.sh'])).toBe('x/SKILL.md');
  });

  it('rejects an archive with no core markdown', () => {
    expect(() => pickCorePath(['a/b/c/SKILL.md', 'run.sh'])).toThrow(SkillDomainError);
  });

  it('marks code and scripts/ as executable, the rest as not-core', () => {
    expect(classifyIgnored('x/scripts/detect.txt')).toBe('executable');
    expect(classifyIgnored('x/tool.py')).toBe('executable');
    expect(classifyIgnored('x/README.md')).toBe('not-core');
  });
});

describe('SkillsService.previewImport', () => {
  it('parses a single .md into an editable preview', () => {
    const p = service().svc.previewImport('flaky.md', b64(SKILL_MD));
    expect(p).toMatchObject({ name: 'flaky-tests', type: 'rubric', core_path: 'flaky.md' });
    expect(p.body).toContain('# Flaky tests');
    expect(p.warnings.join(' ')).toMatch(/allowed-tools/);
  });

  it('extracts only the core from a zip and never reads the executables', () => {
    const zip = makeZip({
      'flaky-tests/SKILL.md': SKILL_MD,
      'flaky-tests/scripts/detect-flaky.sh': '#!/bin/sh\nexit 1\n',
      'flaky-tests/README.md': 'readme',
      '__MACOSX/flaky-tests/._SKILL.md': 'junk',
    });
    const reader = new ZipArchiveReader();
    const reads: string[] = [];
    const spyReader = {
      list: (data: Uint8Array, limits: Parameters<ZipArchiveReader['list']>[1]) =>
        reader.list(data, limits).map((e) => ({
          ...e,
          read: () => {
            reads.push(e.path);
            return e.read();
          },
        })),
    };
    const svc = new SkillsService({ store: new MemoryStore(), archive: spyReader });
    const p = svc.previewImport('flaky-tests.zip', b64(zip));
    expect(reads).toEqual(['flaky-tests/SKILL.md']);
    expect(p.core_path).toBe('flaky-tests/SKILL.md');
    expect(p.ignored_files).toEqual([
      { path: 'flaky-tests/scripts/detect-flaky.sh', reason: 'executable' },
      { path: 'flaky-tests/README.md', reason: 'not-core' },
    ]);
    expect(p.warnings.join(' ')).toMatch(/1 executable file/);
  });

  it('rejects an archive that inflates past the limit (zip bomb)', () => {
    const zip = makeZip({ 'SKILL.md': 'a'.repeat(6_000_000) });
    expect(() => service().svc.previewImport('bomb.zip', b64(zip))).toThrow(/expands to more than/);
  });

  it('rejects unsupported file types and non-zip bytes', () => {
    expect(() => service().svc.previewImport('x.exe', b64('MZ'))).toThrow(/\.md file or a \.zip/);
    expect(() => service().svc.previewImport('x.zip', b64('not a zip'))).toThrow(/Not a ZIP/);
  });

  it('ignores path traversal entries', () => {
    const zip = makeZip({ '../evil.md': 'x', 'SKILL.md': SKILL_MD }, { deflate: false });
    const p = service().svc.previewImport('t.zip', b64(zip));
    expect(p.core_path).toBe('SKILL.md');
    expect(p.ignored_files).toEqual([]);
  });
});

describe('SkillsService CRUD rules', () => {
  const input = { name: 'a', description: 'Use when X.', type: 'rubric' as const, body: 'v1' };

  it('imported skills always start disabled', async () => {
    const { svc } = service();
    const s = await svc.create('ws', { ...input, source: 'imported', enabled: true });
    expect(s.enabled).toBe(false);
    expect(s.source).toBe('imported');
  });

  it('a body edit creates a new version; a metadata edit does not', async () => {
    const { svc } = service();
    const s = await svc.create('ws', input);
    const meta = await svc.update('ws', s.id, { description: 'Use when Y.' });
    expect(meta?.version).toBe(1);
    const edited = await svc.update('ws', s.id, { body: 'v2' });
    expect(edited?.version).toBe(2);
    const versions = await svc.listVersions('ws', s.id);
    expect(versions?.map((v) => [v.version, v.body])).toEqual([[2, 'v2'], [1, 'v1']]);
  });

  it('rejects a duplicate name in the workspace', async () => {
    const { svc } = service();
    await svc.create('ws', input);
    await expect(svc.create('ws', input)).rejects.toMatchObject({ code: 'skill_name_taken' });
  });
});

describe('formatSkillForPrompt', () => {
  it('leads with the name and the directive description', () => {
    expect(formatSkillForPrompt({ name: 'n', description: 'Use when X.', body: '\nBody\n' })).toBe(
      '### Skill: n\nUse when X.\n\nBody',
    );
  });
});
