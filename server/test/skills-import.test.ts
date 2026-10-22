import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { parseFrontmatter, parseSkillImport } from '../src/modules/skills/import.js';
import { isBodyChange } from '../src/modules/skills/helpers.js';

/**
 * Skill import — pure parsing of `.md` / `.zip` uploads. Pins: frontmatter
 * fields, name fallbacks, SKILL.md-only extraction (everything else skipped,
 * never read), and the rejection paths.
 */

const SKILL_MD = `---
name: branch-coverage
description: >
  Flag every new branch
  that no test exercises.
type: rubric
allowed-tools: Bash
---

# Branch coverage

Every new \`if\` needs a test for both sides.
`;

function ok(result: ReturnType<typeof parseSkillImport>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.preview;
}

describe('parseFrontmatter', () => {
  it('reads flat keys, quoted values and folded block scalars', () => {
    const { attrs, body } = parseFrontmatter(SKILL_MD);
    expect(attrs.name).toBe('branch-coverage');
    expect(attrs.description).toBe('Flag every new branch that no test exercises.');
    expect(attrs.type).toBe('rubric');
    expect(body.trim().startsWith('# Branch coverage')).toBe(true);
    expect(parseFrontmatter('---\nname: "quoted"\n---\nB').attrs.name).toBe('quoted');
  });

  it('keeps literal block scalars line by line', () => {
    const { attrs } = parseFrontmatter('---\ndescription: |\n  line one\n  line two\n---\nB');
    expect(attrs.description).toBe('line one\nline two');
  });

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Title\nbody')).toEqual({ attrs: {}, body: '# Title\nbody' });
  });
});

describe('parseSkillImport — markdown', () => {
  it('extracts name, description, type and body', () => {
    const p = ok(parseSkillImport('skill.md', strToU8(SKILL_MD)));
    expect(p).toMatchObject({
      name: 'branch-coverage',
      description: 'Flag every new branch that no test exercises.',
      type: 'rubric',
      files: [{ path: 'skill.md', status: 'used' }],
    });
    expect(p.body).not.toContain('allowed-tools');
  });

  it('falls back to the first heading, then the filename; unknown type → custom', () => {
    expect(ok(parseSkillImport('x.md', strToU8('# From Heading\ntext'))).name).toBe('From Heading');
    const noHeading = ok(parseSkillImport('my-rule.markdown', strToU8('---\ntype: nope\n---\ntext')));
    expect(noHeading.name).toBe('my-rule');
    expect(noHeading.type).toBe('custom');
  });

  it('rejects empty bodies, non-UTF-8 text and unsupported extensions', () => {
    expect(parseSkillImport('a.md', strToU8('---\nname: x\n---\n  ')).ok).toBe(false);
    expect(parseSkillImport('a.md', new Uint8Array([0xff, 0xfe, 0xfd])).ok).toBe(false);
    expect(parseSkillImport('a.sh', strToU8('echo hi')).ok).toBe(false);
    expect(parseSkillImport('a.md', new Uint8Array()).ok).toBe(false);
  });
});

describe('parseSkillImport — zip', () => {
  it('uses only SKILL.md and lists every other entry as skipped', () => {
    const zip = zipSync({
      'branch-coverage/SKILL.md': strToU8(SKILL_MD),
      'branch-coverage/scripts/install.sh': strToU8('rm -rf /'),
      'branch-coverage/references/notes.md': strToU8('# extra'),
    });
    const p = ok(parseSkillImport('bundle.zip', zip));
    expect(p.name).toBe('branch-coverage');
    expect(p.body).not.toContain('rm -rf');
    expect(p.body).not.toContain('# extra');
    expect(p.files).toEqual([
      { path: 'branch-coverage/SKILL.md', status: 'used' },
      expect.objectContaining({ path: 'branch-coverage/scripts/install.sh', status: 'skipped' }),
      expect.objectContaining({ path: 'branch-coverage/references/notes.md', status: 'skipped' }),
    ]);
  });

  it('accepts SKILL.md at the root and names a heading-less skill after the archive', () => {
    const zip = zipSync({ 'SKILL.md': strToU8('plain body') });
    expect(ok(parseSkillImport('root-skill.zip', zip)).name).toBe('root-skill');
  });

  it('rejects archives without a single SKILL.md and invalid archives', () => {
    expect(parseSkillImport('a.zip', zipSync({ 'README.md': strToU8('x') })).ok).toBe(false);
    const twoSkills = zipSync({ 'a/SKILL.md': strToU8('x'), 'b/SKILL.md': strToU8('y') });
    expect(parseSkillImport('a.zip', twoSkills).ok).toBe(false);
    expect(parseSkillImport('a.zip', strToU8('not a zip')).ok).toBe(false);
  });
});

describe('isBodyChange', () => {
  it('is true only for a defined, different body', () => {
    expect(isBodyChange({ body: 'a' }, 'b')).toBe(true);
    expect(isBodyChange({ body: 'a' }, 'a')).toBe(false);
    expect(isBodyChange({ body: 'a' }, undefined)).toBe(false);
  });
});

describe('docs/skills-import/phantom-api-gate.zip (live import demo)', () => {
  it('parses to the phantom-api-gate skill and skips its script', () => {
    const zip = readFileSync(new URL('../../docs/skills-import/phantom-api-gate.zip', import.meta.url));
    const p = ok(parseSkillImport('phantom-api-gate.zip', new Uint8Array(zip)));
    expect(p).toMatchObject({ name: 'phantom-api-gate', type: 'security' });
    expect(p.files).toContainEqual(
      expect.objectContaining({ path: 'phantom-api-gate/scripts/install-hook.sh', status: 'skipped' }),
    );
  });
});
