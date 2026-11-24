import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseSkillImport, MAX_MD_BYTES } from './import.js';

const enc = (s: string) => strToU8(s);
const MD = `---
name: "flaky-test-patterns"
description: 'Spot flaky tests'
type: rubric
---
# Body

Check sleeps.
`;

function code(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { statusCode?: number }).statusCode;
  }
  return undefined;
}

describe('parseSkillImport .md', () => {
  it('parses frontmatter and body, stripping quotes', () => {
    const p = parseSkillImport('x.md', enc(MD));
    expect(p).toMatchObject({
      name: 'flaky-test-patterns',
      description: 'Spot flaky tests',
      type: 'rubric',
      ignored_files: [],
      warnings: [],
    });
    expect(p.body).toBe('# Body\n\nCheck sleeps.\n');
  });

  it('falls back to filename, first body line and custom type with warnings', () => {
    const p = parseSkillImport('my-skill.md', enc('---\ntype: nope\n---\nFirst line\nmore'));
    expect(p.name).toBe('my-skill');
    expect(p.description).toBe('First line');
    expect(p.type).toBe('custom');
    expect(p.warnings).toHaveLength(3);
  });

  it('handles a file without frontmatter', () => {
    const p = parseSkillImport('plain.md', enc('Just text'));
    expect(p.body).toBe('Just text');
    expect(p.name).toBe('plain');
  });

  it('rejects other extensions with 422', () => {
    expect(code(() => parseSkillImport('a.txt', enc('x')))).toBe(422);
  });
});

describe('parseSkillImport .zip', () => {
  it('reads only SKILL.md; the script is ignored and never read', () => {
    const zip = zipSync({
      'flaky/SKILL.md': enc(MD),
      'flaky/scripts/detect.sh': enc('#!/bin/sh\necho pwned > /tmp/pwned\n'),
    });
    const p = parseSkillImport('flaky.zip', zip);
    expect(p.name).toBe('flaky-test-patterns');
    expect(p.ignored_files).toEqual(['flaky/scripts/detect.sh']);
    expect(p.body).not.toContain('pwned');
  });

  it('falls back to the only .md when there is no SKILL.md', () => {
    const p = parseSkillImport('a.zip', zipSync({ 'notes.md': enc(MD), 'data.bin': new Uint8Array(3) }));
    expect(p.name).toBe('flaky-test-patterns');
    expect(p.ignored_files).toEqual(['data.bin']);
  });

  it('422 when the declared size of the chosen file is too large', () => {
    const big = enc(`---\nname: a\n---\n${'x'.repeat(MAX_MD_BYTES + 10)}`);
    expect(code(() => parseSkillImport('a.zip', zipSync({ 'SKILL.md': big })))).toBe(422);
  });

  it('422 when there is no usable .md', () => {
    expect(code(() => parseSkillImport('a.zip', zipSync({ 'run.sh': enc('echo') })))).toBe(422);
    expect(
      code(() => parseSkillImport('a.zip', zipSync({ 'a.md': enc(MD), 'b.md': enc(MD) }))),
    ).toBe(422);
  });

  it('422 for an invalid zip', () => {
    expect(code(() => parseSkillImport('a.zip', enc('not a zip at all, really')))).toBe(422);
  });

  it('skips path-traversal entries and lists them as ignored with a warning', () => {
    const zip = zipSync({ 'SKILL.md': enc(MD), '../evil.md': enc('x'), '/abs/x.sh': enc('x') });
    const p = parseSkillImport('a.zip', zip);
    expect(p.ignored_files).toEqual(expect.arrayContaining(['../evil.md', '/abs/x.sh']));
    expect(p.warnings.some((w) => w.includes('unsafe'))).toBe(true);
    expect(p.name).toBe('flaky-test-patterns');
  });

  it('422 when the archive has too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': enc(MD) };
    for (let i = 0; i < 210; i++) files[`f${i}.txt`] = enc('x');
    expect(code(() => parseSkillImport('a.zip', zipSync(files)))).toBe(422);
  });
});
