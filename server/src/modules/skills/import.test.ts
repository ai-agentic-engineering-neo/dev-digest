import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { MAX_ARCHIVE_BYTES, MAX_SKILL_MD_BYTES } from './constants.js';
import { parseImportedSkill, parseMarkdownSkill, SkillImportError } from './import.js';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
  fork: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFile: vi.fn(), writeFileSync: vi.fn() };
});

const fixtureMd = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/skill-fixtures/flaky-tests/SKILL.md'),
  'utf8',
);

function zipBytes(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text);
  return zipSync(entries);
}

describe('parseMarkdownSkill', () => {
  it('reads YAML name/description and leaves the remainder as body', () => {
    const preview = parseMarkdownSkill(fixtureMd);
    expect(preview.name).toBe('flaky-tests');
    expect(preview.description).toBe(
      'Flag tests that depend on time, order, or unseeded randomness.',
    );
    expect(preview.body).toContain('# Flaky tests');
    expect(preview.body).not.toContain('---');
    expect(preview.body).toContain('unseeded');
  });

  it('uses the first heading as name when frontmatter is missing', () => {
    const preview = parseMarkdownSkill('# Corner cases\n\nFlag empty and null inputs.');
    expect(preview.name).toBe('Corner cases');
    expect(preview.description).toBe('');
    expect(preview.body).toContain('Flag empty and null inputs.');
  });
});

describe('parseImportedSkill', () => {
  it('extracts SKILL.md from a zip that also has scripts/pwn.sh and never shells or writes', () => {
    const preview = parseImportedSkill(
      'flaky-tests.skill',
      zipBytes({
        'SKILL.md': fixtureMd,
        'scripts/pwn.sh': '#!/bin/sh\necho pwned\n',
      }),
    );

    expect(preview.name).toBe('flaky-tests');
    expect(preview.body).toContain('# Flaky tests');
    expect(preview.body).not.toContain('pwned');
    expect(childProcess.exec).not.toHaveBeenCalled();
    expect(childProcess.execFile).not.toHaveBeenCalled();
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(childProcess.fork).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('reads nested skill-name/SKILL.md when root SKILL.md is absent', () => {
    const preview = parseImportedSkill(
      'pack.zip',
      zipBytes({ 'flaky-tests/SKILL.md': fixtureMd }),
    );
    expect(preview.name).toBe('flaky-tests');
    expect(preview.body).toContain('# Flaky tests');
  });

  it('prefers root SKILL.md when both root and nested exist', () => {
    const preview = parseImportedSkill(
      'pack.zip',
      zipBytes({
        'SKILL.md': '---\nname: root-skill\ndescription: From zip root.\n---\n\n# Root\nroot body\n',
        'nested/SKILL.md': fixtureMd,
      }),
    );
    expect(preview.name).toBe('root-skill');
    expect(preview.body).toContain('root body');
  });

  it('rejects zip-slip paths with HTTP-400 semantics', () => {
    expect(() =>
      parseImportedSkill(
        'evil.zip',
        zipBytes({ '../etc/passwd': 'root:x:0:0:root:/root:/bin/sh\n', 'SKILL.md': fixtureMd }),
      ),
    ).toThrow(SkillImportError);
    try {
      parseImportedSkill('evil.zip', zipBytes({ '../etc/passwd': 'x', 'SKILL.md': fixtureMd }));
    } catch (err) {
      expect(err).toBeInstanceOf(SkillImportError);
      expect((err as SkillImportError).statusCode).toBe(400);
    }
  });

  it('rejects oversize archives, oversize markdown, and unknown extensions', () => {
    const bigZip = new Uint8Array(MAX_ARCHIVE_BYTES + 1);
    expect(() => parseImportedSkill('huge.zip', bigZip)).toThrow(SkillImportError);

    const bigMd = new Uint8Array(MAX_SKILL_MD_BYTES + 1);
    expect(() => parseImportedSkill('huge.md', bigMd)).toThrow(SkillImportError);

    expect(() => parseImportedSkill('payload.exe', strToU8('# x\nbody'))).toThrow(SkillImportError);
    try {
      parseImportedSkill('payload.exe', strToU8('# x\nbody'));
    } catch (err) {
      expect((err as SkillImportError).statusCode).toBe(400);
    }
  });
});
