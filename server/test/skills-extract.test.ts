import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  classifyEntry,
  parseFrontmatter,
  previewFromUpload,
  skillCoreFromMarkdown,
  slugifySkillName,
  ExtractError,
} from '../src/modules/skills/extract.js';
import { listZipEntries, readZipEntryText } from '../src/modules/skills/archive.js';
import { renderSkillBlocks } from '../src/modules/reviews/helpers.js';

/**
 * Hermetic coverage of the import path — the only place third-party text enters
 * the product. Everything here is pure: bytes in, preview out, no DB, no fs.
 *
 * The ZIP fixtures are built in-process by `makeZip` so the tests do not depend
 * on a `zip` binary being installed.
 */

interface ZipFile {
  path: string;
  content: string;
  /** 0 = stored, 8 = deflate. Both paths are exercised. */
  method?: 0 | 8;
}

/**
 * Minimal ZIP writer for fixtures: local headers + central directory + EOCD.
 * CRCs are written as 0 — the reader under test never verifies them, and an
 * unused field in a fixture is noise, not coverage.
 */
function makeZip(files: ZipFile[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const method = file.method ?? 0;
    const name = Buffer.from(file.path, 'utf8');
    const raw = Buffer.from(file.content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, centralBuf, eocd]);
}

const SKILL_MD = `---
name: Flaky Test Heuristics
description: Detects timing and ordering sources of flakiness.
type: custom
---

# Flaky test heuristics

Flag \`sleep()\` used as synchronisation.`;

describe('parseFrontmatter', () => {
  it('reads flat key: value pairs and strips the fence from the body', () => {
    const { data, body } = parseFrontmatter(SKILL_MD);
    expect(data).toMatchObject({
      name: 'Flaky Test Heuristics',
      description: 'Detects timing and ordering sources of flakiness.',
      type: 'custom',
    });
    expect(body.trimStart().startsWith('# Flaky test heuristics')).toBe(true);
  });

  it('leaves a document without frontmatter untouched', () => {
    const { data, body } = parseFrontmatter('# Just a heading\n\ntext');
    expect(data).toEqual({});
    expect(body).toBe('# Just a heading\n\ntext');
  });

  it('does not treat a horizontal rule mid-document as frontmatter', () => {
    const { data, body } = parseFrontmatter('# Title\n\n---\n\nmore');
    expect(data).toEqual({});
    expect(body).toContain('more');
  });
});

describe('skillCoreFromMarkdown', () => {
  it('prefers frontmatter and slugifies the name', () => {
    const core = skillCoreFromMarkdown(SKILL_MD, 'whatever.md');
    expect(core.name).toBe('flaky-test-heuristics');
    expect(core.type).toBe('custom');
    expect(core.warnings).toHaveLength(0);
  });

  it('derives name and description from the document when frontmatter is absent', () => {
    const core = skillCoreFromMarkdown(
      '# No Mocking Rule\n\nMocks may only replace a real boundary.',
      'rule.md',
    );
    expect(core.name).toBe('no-mocking-rule');
    expect(core.description).toBe('Mocks may only replace a real boundary.');
    expect(core.warnings).toHaveLength(2);
  });

  it('falls back to custom and warns when the declared type is unknown', () => {
    const core = skillCoreFromMarkdown(
      '---\nname: x\ndescription: y\ntype: wisdom\n---\n\n# X\n\nbody',
      'x.md',
    );
    expect(core.type).toBe('custom');
    expect(core.warnings.join(' ')).toContain('wisdom');
  });

  it('refuses an empty document rather than storing a blank skill', () => {
    expect(() => skillCoreFromMarkdown('---\nname: x\n---\n\n   ', 'x.md')).toThrow(ExtractError);
  });
});

describe('slugifySkillName', () => {
  it('produces a kebab-case identifier', () => {
    expect(slugifySkillName('  Flaky Test  Heuristics!! ')).toBe('flaky-test-heuristics');
    expect(slugifySkillName('SKILL.md')).toBe('skill');
  });

  it('never returns an empty name', () => {
    expect(slugifySkillName('***')).toBe('imported-skill');
  });
});

describe('classifyEntry', () => {
  it('treats scripts as executable by extension AND by directory', () => {
    expect(classifyEntry('scripts/install.sh', 10)).toBe('executable');
    expect(classifyEntry('skill/hooks/pre-commit', 10)).toBe('executable');
    expect(classifyEntry('tool.py', 10)).toBe('executable');
  });

  it('accepts markdown and rejects everything else', () => {
    expect(classifyEntry('SKILL.md', 10)).toBeUndefined();
    expect(classifyEntry('notes.markdown', 10)).toBeUndefined();
    expect(classifyEntry('config.yml', 10)).toBe('not-markdown');
  });

  it('rejects an oversized markdown entry', () => {
    expect(classifyEntry('SKILL.md', 10 * 1024 * 1024)).toBe('too-large');
  });
});

describe('archive reader', () => {
  it('lists entries and inflates a deflated one', () => {
    const buf = makeZip([
      { path: 'a/SKILL.md', content: SKILL_MD, method: 8 },
      { path: 'a/scripts/run.sh', content: '#!/bin/sh\necho hi' },
    ]);
    const entries = listZipEntries(buf);
    expect(entries.map((e) => e.path)).toEqual(['a/SKILL.md', 'a/scripts/run.sh']);
    expect(readZipEntryText(buf, entries[0]!)).toBe(SKILL_MD);
  });
});

describe('archive reader — hostile headers', () => {
  /** Overwrite the first central-directory entry's compressedSize field. */
  function lieAboutCompressedSize(buf: Buffer, value: number): Buffer {
    const copy = Buffer.from(buf);
    // EOCD is the last 22 bytes here (no comment), and its offset-of-central-
    // directory field is at +16; compressedSize sits at +20 of that record.
    const eocd = copy.length - 22;
    const central = copy.readUInt32LE(eocd + 16);
    copy.writeUInt32LE(value, central + 20);
    return copy;
  }

  it('refuses an entry that declares more data than the archive holds', () => {
    const buf = makeZip([{ path: 'SKILL.md', content: SKILL_MD }]);
    const lying = lieAboutCompressedSize(buf, 5_000_000);
    const entries = listZipEntries(lying);
    expect(() => readZipEntryText(lying, entries[0]!)).toThrow(/more data than the archive holds/);
  });

  it('refuses a stored entry larger than the per-entry cap, whatever it declares', () => {
    // `size` (the declared uncompressed length) says 1 byte; the real payload is
    // way over the cap. The gate must read the DATA, not the claim.
    const big = 'x'.repeat(600 * 1024);
    const buf = makeZip([{ path: 'SKILL.md', content: big }]);
    const eocd = buf.length - 22;
    const central = buf.readUInt32LE(eocd + 16);
    buf.writeUInt32LE(1, central + 24); // central directory: size = 1
    const entries = listZipEntries(buf);
    expect(entries[0]!.size).toBe(1);
    expect(() => readZipEntryText(buf, entries[0]!)).toThrow(/limit/);
  });
});

describe('previewFromUpload', () => {
  it('imports a bare markdown file', () => {
    const preview = previewFromUpload('flaky.md', Buffer.from(SKILL_MD), 'imported_url');
    expect(preview.name).toBe('flaky-test-heuristics');
    expect(preview.source).toBe('imported_url');
    expect(preview.files_used).toEqual(['flaky.md']);
    expect(preview.files_skipped).toEqual([]);
  });

  it('takes the skill core out of an archive and skips the executables', () => {
    const buf = makeZip([
      { path: 'flaky/SKILL.md', content: SKILL_MD, method: 8 },
      { path: 'flaky/scripts/install.sh', content: 'rm -rf /' },
      { path: 'flaky/hooks/post-import.js', content: 'process.exit(1)' },
      { path: 'flaky/notes.md', content: '# Notes\n\nsecondary' },
      { path: 'flaky/config.yml', content: 'a: 1' },
    ]);
    const preview = previewFromUpload('flaky.zip', buf, 'imported_url');

    expect(preview.files_used).toEqual(['flaky/SKILL.md']);
    expect(preview.body).toContain('# Flaky test heuristics');
    // The executable bodies never appear anywhere in what we produced.
    expect(preview.body).not.toContain('rm -rf');

    const skipped = Object.fromEntries(preview.files_skipped.map((f) => [f.path, f.reason]));
    expect(skipped).toEqual({
      'flaky/scripts/install.sh': 'executable',
      'flaky/hooks/post-import.js': 'executable',
      'flaky/config.yml': 'not-markdown',
      'flaky/notes.md': 'not-core',
    });
    expect(preview.warnings.join(' ')).toContain('2 executable file(s)');
  });

  it('prefers SKILL.md over a shallower README', () => {
    const buf = makeZip([
      { path: 'README.md', content: '# Readme\n\nrepo readme' },
      { path: 'skills/mine/SKILL.md', content: '# Mine\n\nthe skill' },
    ]);
    expect(previewFromUpload('bundle.zip', buf, 'community').files_used).toEqual([
      'skills/mine/SKILL.md',
    ]);
  });

  it('refuses an archive with no markdown at all', () => {
    const buf = makeZip([{ path: 'run.sh', content: 'echo hi' }]);
    expect(() => previewFromUpload('x.zip', buf, 'imported_url')).toThrow(/no markdown/i);
  });

  it('detects a ZIP by its signature even when the filename lies', () => {
    const buf = makeZip([{ path: 'SKILL.md', content: SKILL_MD }]);
    expect(previewFromUpload('skill.md', buf, 'imported_url').files_used).toEqual(['SKILL.md']);
  });

  it('rejects a file that is neither markdown nor an archive', () => {
    expect(() => previewFromUpload('skill.exe', Buffer.from('MZ...'), 'imported_url')).toThrow(
      /Markdown file/,
    );
  });
});

describe('renderSkillBlocks', () => {
  const base = { id: 's1', name: 'pr-quality-rubric', type: 'rubric', body: '# Rubric\n\nrules' };

  it('labels a workspace-authored skill with its type and source', () => {
    const [block] = renderSkillBlocks([{ ...base, source: 'manual' }]);
    expect(block).toBe('### Skill: pr-quality-rubric (rubric · manual)\n# Rubric\n\nrules');
  });

  it('marks an imported skill as third-party text in the block header', () => {
    const [block] = renderSkillBlocks([{ ...base, source: 'community' }]);
    expect(block).toContain('third-party text');
    expect(block).toContain('# Rubric');
  });

  it('keeps the given order and produces one block per skill', () => {
    const blocks = renderSkillBlocks([
      { ...base, id: 'a', name: 'first', source: 'manual' },
      { ...base, id: 'b', name: 'second', source: 'manual' },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('first');
    expect(blocks[1]).toContain('second');
  });
});
