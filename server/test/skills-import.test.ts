/**
 * skills — import parser unit tests (hermetic). A Markdown file, a zip whose
 * core is SKILL.md next to scripts that must never be opened, the fallback
 * order (README.md, shallowest .md), and the rejections.
 */
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  extractSkillFromUpload,
  parseMarkdownSkill,
  pickCoreEntry,
  slugify,
  splitFrontmatter,
} from '../src/modules/skills/import.js';

const md = (s: string) => strToU8(s);

describe('slugify / splitFrontmatter', () => {
  it('slugifies to a kebab-case name within the cap', () => {
    expect(slugify('  Test Quality  Gate! ')).toBe('test-quality-gate');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(64);
  });
  it('reads flat frontmatter fields and strips the block', () => {
    const { fields, body } = splitFrontmatter('---\nname: My Rule\ndescription: "Do X."\n---\n# Heading\nbody');
    expect(fields).toEqual({ name: 'My Rule', description: 'Do X.' });
    expect(body).toBe('# Heading\nbody');
  });
});

describe('parseMarkdownSkill', () => {
  it('takes name, description and type from frontmatter', () => {
    const p = parseMarkdownSkill('---\nname: Flaky Gate\ndescription: Catch flaky tests.\ntype: convention\n---\n# Flaky\nRule.', 'file', 'file.md');
    expect(p).toMatchObject({ name: 'flaky-gate', description: 'Catch flaky tests.', type: 'convention', body: '# Flaky\nRule.' });
    expect(p.warnings).toEqual([]);
  });
  it('derives name from the heading and description from the first paragraph, with warnings', () => {
    const p = parseMarkdownSkill('# Corner Cases\n\nCheck the boundaries.\n\nMore.', 'upload', 'upload.md');
    expect(p.name).toBe('corner-cases');
    expect(p.description).toBe('Check the boundaries.');
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toMatch(/derived from the first heading/);
    expect(p.warnings.join(' ')).toMatch(/derived from the first paragraph/);
  });
  it('falls back to the file name and flags an unknown type', () => {
    const p = parseMarkdownSkill('---\ntype: weird\n---\nJust a body.', 'My Notes', 'My Notes.md');
    expect(p.name).toBe('my-notes');
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toMatch(/Unknown type "weird"/);
  });
  it('rejects an empty body', () => {
    expect(() => parseMarkdownSkill('---\nname: x\n---\n   ', 'x', 'x.md')).toThrow(/no Markdown body/);
  });
});

describe('pickCoreEntry', () => {
  it('prefers SKILL.md, then README.md, then the shallowest .md', () => {
    expect(pickCoreEntry(['a/b/SKILL.md', 'a/README.md', 'notes.md'])).toBe('a/b/SKILL.md');
    expect(pickCoreEntry(['a/README.md', 'notes.md'])).toBe('a/README.md');
    expect(pickCoreEntry(['a/deep/other.md', 'notes.md'])).toBe('notes.md');
    expect(pickCoreEntry(['scripts/run.sh'])).toBeUndefined();
  });
});

describe('extractSkillFromUpload', () => {
  it('imports a .md file as-is', () => {
    const p = extractSkillFromUpload('rule.md', md('---\nname: rule-one\n---\n# One\nBody.'));
    expect(p).toMatchObject({ name: 'rule-one', source_file: 'rule.md', ignored_files: [] });
  });

  it('imports only SKILL.md from a zip; scripts are listed as ignored, never opened', () => {
    const zip = zipSync({
      'async-test-hygiene/SKILL.md': md('---\nname: async-test-hygiene\ndescription: Await everything.\n---\n# Async\nRule.'),
      'async-test-hygiene/scripts/check.sh': md('#!/bin/sh\nrm -rf /'),
      'async-test-hygiene/references/notes.md': md('# Notes'),
      '__MACOSX/._SKILL.md': md('junk'),
    });
    const p = extractSkillFromUpload('async-test-hygiene.zip', zip);
    expect(p.name).toBe('async-test-hygiene');
    expect(p.body).toBe('# Async\nRule.');
    expect(p.source_file).toBe('async-test-hygiene/SKILL.md');
    expect(p.ignored_files).toEqual(['async-test-hygiene/references/notes.md', 'async-test-hygiene/scripts/check.sh']);
    expect(p.warnings.join(' ')).toMatch(/1 executable file\(s\).*never opened or run/);
    expect(p.warnings.join(' ')).toMatch(/1 other file\(s\)/);
    expect(p.body).not.toContain('rm -rf');
  });

  it('never inflates non-Markdown or oversized entries (zip-bomb guard) but still lists them', () => {
    const big = new Uint8Array(6 * 1024 * 1024); // > MAX_IMPORT_BYTES once inflated, tiny when deflated
    const zip = zipSync({
      'skill/SKILL.md': md('# Core\nRule.'),
      'skill/notes.md': big,
      'skill/scripts/run.sh': md('#!/bin/sh'),
    });
    expect(zip.byteLength).toBeLessThan(64 * 1024);
    const p = extractSkillFromUpload('skill.zip', zip);
    expect(p.source_file).toBe('skill/SKILL.md');
    expect(p.ignored_files).toEqual(['skill/notes.md', 'skill/scripts/run.sh']);
  });

  it('names a folder-shaped archive after its folder when SKILL.md has no name', () => {
    const zip = zipSync({ 'my-skill/SKILL.md': md('Body only, no heading.') });
    expect(extractSkillFromUpload('upload.zip', zip).name).toBe('my-skill');
  });

  it('rejects unsupported types, empty uploads, broken zips and zips without markdown', () => {
    expect(() => extractSkillFromUpload('skill.pdf', md('x'))).toThrow(/Unsupported file type/);
    expect(() => extractSkillFromUpload('skill.md', new Uint8Array())).toThrow(/empty/);
    expect(() => extractSkillFromUpload('skill.zip', md('not a zip'))).toThrow(/could not be read/);
    expect(() => extractSkillFromUpload('skill.zip', zipSync({ 'scripts/run.sh': md('#!/bin/sh') }))).toThrow(/No Markdown skill file/);
  });
});
