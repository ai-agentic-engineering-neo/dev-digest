import { describe, it, expect } from 'vitest';
import {
  headingName,
  inferSkillType,
  isBodyChange,
  parseSkillDocument,
  splitFrontmatter,
} from '../src/modules/skills/helpers.js';

/**
 * The import parser and the version-bump rule — the two places where skills
 * logic can be wrong in a way no type checks. Both are pure, so no DB here.
 */

describe('splitFrontmatter', () => {
  it('parses simple key: value frontmatter and strips it from the body', () => {
    const { frontmatter, body } = splitFrontmatter(
      '---\nname: secret-gate\ntype: security\n---\n# Secret gate\n\nDetect sk_live.',
    );
    expect(frontmatter).toEqual({ name: 'secret-gate', type: 'security' });
    expect(body).toBe('# Secret gate\n\nDetect sk_live.');
  });

  it('folds a `>` block into one line (the SKILL.md description convention)', () => {
    const { frontmatter } = splitFrontmatter(
      '---\nname: x\ndescription: >\n  Flag tests that cover only\n  the happy path.\n---\nBody',
    );
    expect(frontmatter.description).toBe('Flag tests that cover only the happy path.');
  });

  it('keeps line breaks in a `|` literal block', () => {
    const { frontmatter } = splitFrontmatter('---\nnotes: |\n  one\n  two\n---\nBody');
    expect(frontmatter.notes).toBe('one\ntwo');
  });

  it('treats a document with no frontmatter as all body', () => {
    const { frontmatter, body } = splitFrontmatter('# Just markdown\n\ntext');
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Just markdown\n\ntext');
  });

  it('degrades to "no frontmatter" when the block is never closed', () => {
    // A malformed header must not lose the body — the text is still importable.
    const input = '---\nname: broken\n# heading\n\nbody text';
    const { frontmatter, body } = splitFrontmatter(input);
    expect(frontmatter).toEqual({});
    expect(body).toBe(input);
  });

  it('normalises CRLF so a Windows-authored file parses', () => {
    const { frontmatter } = splitFrontmatter('---\r\nname: crlf\r\n---\r\nBody\r\n');
    expect(frontmatter.name).toBe('crlf');
  });
});

describe('parseSkillDocument', () => {
  it('prefers frontmatter over the prose', () => {
    const parsed = parseSkillDocument(
      '---\nname: api-contract-gate\ndescription: Catch breaking changes.\ntype: convention\n---\n# Something else\n\nA different paragraph.',
    );
    expect(parsed).toMatchObject({
      name: 'api-contract-gate',
      description: 'Catch breaking changes.',
      type: 'convention',
    });
  });

  it('derives name from the heading and description from the first paragraph', () => {
    const parsed = parseSkillDocument('# Test quality rubric\n\nEvery branch needs a test.\n');
    expect(parsed.name).toBe('Test quality rubric');
    expect(parsed.description).toBe('Every branch needs a test.');
  });

  it('skips headings, fences and bullets when picking the description paragraph', () => {
    const parsed = parseSkillDocument(
      '# Title\n\n- a bullet\n\n```\ncode\n```\n\nThe real summary sentence.',
    );
    expect(parsed.description).toBe('The real summary sentence.');
  });

  it('falls back to a placeholder name when there is neither frontmatter nor heading', () => {
    expect(parseSkillDocument('just some text').name).toBe('untitled-skill');
  });

  it('ignores a frontmatter type that is not a known SkillType', () => {
    // An unknown value must not leak into the DB column — fall back to the scan.
    const parsed = parseSkillDocument('---\nname: x\ntype: nonsense\n---\nSSRF and injection.');
    expect(parsed.type).toBe('security');
  });
});

describe('inferSkillType', () => {
  it('prefers security over the vaguer categories', () => {
    // "checklist" would also match `rubric`; security is checked first on purpose.
    expect(inferSkillType('a security checklist for injection')).toBe('security');
  });

  it('falls back to custom when nothing matches', () => {
    expect(inferSkillType('some entirely unrelated prose')).toBe('custom');
  });
});

describe('headingName', () => {
  it('finds the first heading at any level', () => {
    expect(headingName('some intro\n\n### Deep heading\n')).toBe('Deep heading');
  });
});

describe('isBodyChange', () => {
  it('is true only when the body actually differs', () => {
    expect(isBodyChange({ body: 'a' }, { body: 'b' })).toBe(true);
    expect(isBodyChange({ body: 'a' }, { body: 'a' })).toBe(false);
  });

  it('is false for a rename or a toggle — versions track instructions, not edits', () => {
    expect(isBodyChange({ body: 'a' }, {})).toBe(false);
  });
});
