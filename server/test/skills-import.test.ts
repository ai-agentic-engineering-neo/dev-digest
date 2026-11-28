/**
 * M2 import preview, with in-memory fixtures and the real fflate/yaml
 * adapters: frontmatter mapping, choosing the core file, non-.md entries
 * listed but never inflated, and the rejections (unsafe path, limits, no .md).
 * The store is a stub that fails if touched: a preview writes nothing.
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { SkillsService } from '../src/modules/skills/service.js';
import type { AgentLinks, SkillStore } from '../src/modules/skills/ports.js';
import { FflateArchiveReader, YamlFrontmatterParser } from '../src/adapters/skill-import/index.js';

class SpyArchive extends FflateArchiveReader {
  inflated: string[] = [];
  override inflate(data: Uint8Array, path: string): Uint8Array {
    this.inflated.push(path);
    return super.inflate(data, path);
  }
}

const untouchable = new Proxy({} as SkillStore, {
  get: () => () => {
    throw new Error('the preview must not touch the store');
  },
});

function setup() {
  const archive = new SpyArchive();
  const service = new SkillsService({
    skills: untouchable,
    tokens: { count: (s) => s.length },
    archive,
    frontmatter: new YamlFrontmatterParser(),
    links: untouchable as unknown as AgentLinks,
  });
  return { service, archive };
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const zip = (files: Record<string, string | Uint8Array>) =>
  b64(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]))));

const SKILL_MD = `---
name: route-signature-gate
description: Flag a changed route path, parameter or response shape.
type: security
allowed-tools: Bash
---

# Route signature gate
Check every route change.`;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

describe('skill import preview', () => {
  it('maps the frontmatter, picks SKILL.md, and lists other files without inflating them', () => {
    const { service, archive } = setup();
    const png = new Uint8Array(500).fill(7);
    const preview = service.previewImport({
      filename: 'gate.zip',
      content_base64: zip({
        'gate/SKILL.md': SKILL_MD,
        'gate/run.sh': 'rm -rf /',
        'gate/img.png': png,
        'gate/notes.md': '# notes',
      }),
    });

    expect(preview).toMatchObject({
      name: 'route-signature-gate',
      description: 'Flag a changed route path, parameter or response shape.',
      type: 'security',
      source_file: 'gate/SKILL.md',
    });
    expect(preview.body.startsWith('# Route signature gate')).toBe(true);
    expect(preview.skipped_files).toEqual(
      expect.arrayContaining([
        { path: 'gate/run.sh', size: 8 },
        { path: 'gate/img.png', size: 500 },
        { path: 'gate/notes.md', size: 7 },
      ]),
    );
    expect(preview.warnings.some((w) => w.includes('allowed-tools'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('gate/notes.md'))).toBe(true);
    expect(archive.inflated).toEqual(['gate/SKILL.md']);
  });

  it('falls back to custom and to the file stem; a single .md is the core file', () => {
    const { service } = setup();
    const preview = service.previewImport({
      filename: 'pack.zip',
      content_base64: zip({ 'My Rules.md': '---\ntype: style\n---\nBe kind.', 'LICENSE': 'MIT' }),
    });
    expect(preview).toMatchObject({ name: 'my-rules', type: 'custom', description: '', source_file: 'My Rules.md' });
    expect(preview.warnings.some((w) => w.includes('"style"'))).toBe(true);
    expect(preview.warnings.some((w) => w.startsWith('No description'))).toBe(true);
  });

  it('a plain .md upload is its own core file', () => {
    const { service } = setup();
    const preview = service.previewImport({ filename: 'flaky-tests.md', content_base64: b64(strToU8('Watch for sleeps.')) });
    expect(preview).toMatchObject({ name: 'flaky-tests', body: 'Watch for sleeps.', skipped_files: [] });
  });

  it('rejects an unsafe path, oversize uploads and entries, too many entries, and no .md', () => {
    const { service } = setup();
    const preview = (filename: string, content_base64: string) => () =>
      service.previewImport({ filename, content_base64 });

    expect(codeOf(preview('x.zip', zip({ 'SKILL.md': 'ok', '../evil.md': 'x' })))).toBe('import_unsafe_path');
    expect(codeOf(preview('x.md', b64(new Uint8Array(1024 * 1024 + 1).fill(97))))).toBe('import_too_large');
    expect(codeOf(preview('x.zip', zip({ 'SKILL.md': 'a'.repeat(300 * 1024) })))).toBe('import_entry_too_large');
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`f${i}.txt`, 'x']));
    expect(codeOf(preview('x.zip', zip({ 'SKILL.md': 'ok', ...many })))).toBe('import_too_many_entries');
    expect(codeOf(preview('x.zip', zip({ 'run.sh': 'echo', 'img.png': 'x' })))).toBe('import_no_skill_file');
    expect(codeOf(preview('x.zip', zip({ 'a.md': 'a', 'b.md': 'b' })))).toBe('import_no_skill_file');
    expect(codeOf(preview('x.txt', b64(strToU8('hi'))))).toBe('import_unsupported_type');
  });
});
