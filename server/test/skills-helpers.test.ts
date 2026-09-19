import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ValidationError } from '../src/platform/errors.js';
import {
  decodeBase64Capped,
  dedupeSlug,
  firstHeading,
  firstParagraph,
  importPreviewFromUpload,
  isSkillConfigChange,
  parseFrontmatter,
  parseMarkdownImport,
  parseZipImport,
  ratio,
  aggregateFindingRows,
  slugify,
} from '../src/modules/skills/helpers.js';
import {
  MAX_IMPORT_MARKDOWN_BYTES,
  MAX_IMPORT_UPLOAD_BYTES,
  MAX_ZIP_MEMBERS,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../src/modules/skills/constants.js';

/**
 * Hermetic (no Docker) tests for the skills module's pure functions:
 * frontmatter parsing, slugification + collision suffixing, archive core-file
 * selection, ignored/executable classification, every size cap, and the
 * version-bump predicate (specs/02-skills.md §11).
 */

describe('parseFrontmatter', () => {
  it('parses a present, well-formed frontmatter block', () => {
    const raw = ['---', 'name: my-skill', 'description: A short description', 'type: rubric', '---', '', '# Body', 'Hello.'].join('\n');
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ name: 'my-skill', description: 'A short description', type: 'rubric' });
    expect(body.trim()).toBe('# Body\nHello.');
  });

  it('returns no data when frontmatter is absent', () => {
    const raw = '# Just a heading\n\nSome text.';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(body).toBe(raw);
  });

  it('treats an unterminated (malformed) frontmatter block as absent', () => {
    const raw = ['---', 'name: broken', '# no closing fence', 'Some body text'].join('\n');
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(body).toBe(raw);
  });

  it('skips a nested mapping (a `key:` line with no scalar value) rather than guessing', () => {
    const raw = ['---', 'name: has-nested', 'meta:', '  nested: value', 'description: fine', '---', 'Body'].join('\n');
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ name: 'has-nested', description: 'fine' });
    expect(data.meta).toBeUndefined();
    expect(body.trim()).toBe('Body');
  });

  it('is BOM-tolerant', () => {
    const raw = '﻿' + ['---', 'name: bom-skill', '---', 'Body text'].join('\n');
    const { data, body } = parseFrontmatter(raw);
    expect(data.name).toBe('bom-skill');
    expect(body.trim()).toBe('Body text');
  });

  it('strips matching quotes from a scalar value', () => {
    const raw = ['---', 'name: "quoted-name"', "description: 'single quoted'", '---', 'x'].join('\n');
    const { data } = parseFrontmatter(raw);
    expect(data.name).toBe('quoted-name');
    expect(data.description).toBe('single quoted');
  });
});

describe('firstHeading / firstParagraph', () => {
  it('finds the first `# ` heading', () => {
    expect(firstHeading('intro\n# Title Here\nmore')).toBe('Title Here');
    expect(firstHeading('no heading at all')).toBeUndefined();
  });

  it('finds the first non-heading paragraph, collapsing whitespace and capping length', () => {
    const md = '# Title\n\nThis is   the\nfirst paragraph.\n\nSecond paragraph.';
    expect(firstParagraph(md, 200)).toBe('This is the first paragraph.');
    const long = 'x'.repeat(300);
    expect(firstParagraph(long, 200)).toHaveLength(200);
  });
});

describe('slugify + dedupeSlug (D3)', () => {
  it('produces a valid slug from arbitrary text', () => {
    expect(slugify('PR Quality Rubric!!')).toBe('pr-quality-rubric');
    expect(slugify('  leading/trailing  ')).toBe('leading-trailing');
    expect(slugify('Ünïcödé Ñame')).toBe('unicode-name');
  });

  it('never returns a slug shorter than 2 chars or empty', () => {
    expect(slugify('')).toBe('skill');
    expect(slugify('!!!')).toBe('skill');
    expect(slugify('a')).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/);
  });

  it('caps at 64 chars and stays a valid slug', () => {
    const slug = slugify('a'.repeat(100));
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{1,63}$/);
  });

  it('suffixes -2, -3, … on collision, never re-colliding', () => {
    const existing = new Set(['pr-quality-rubric', 'pr-quality-rubric-2']);
    expect(dedupeSlug('pr-quality-rubric', existing)).toBe('pr-quality-rubric-3');
    expect(dedupeSlug('brand-new-name', existing)).toBe('brand-new-name');
  });
});

describe('parseMarkdownImport (.md)', () => {
  const existing = new Set<string>();

  it('derives name from frontmatter, then heading, then filename stem', () => {
    const withName = parseMarkdownImport('whatever.md', '---\nname: from-frontmatter\n---\nbody', existing);
    expect(withName.name).toBe('from-frontmatter');

    const withHeading = parseMarkdownImport('whatever.md', '# From Heading\n\nbody', existing);
    expect(withHeading.name).toBe('from-heading');

    const withStem = parseMarkdownImport('my-cool-skill.md', 'no heading, no frontmatter', existing);
    expect(withStem.name).toBe('my-cool-skill');
  });

  it('de-dupes the derived name against existing workspace names', () => {
    const preview = parseMarkdownImport('dup.md', '# Dup\n\nbody', new Set(['dup']));
    expect(preview.name).toBe('dup-2');
  });

  it('falls back to `custom` when frontmatter.type does not parse as SkillType', () => {
    const bad = parseMarkdownImport('x.md', '---\ntype: not-a-real-type\n---\nbody', existing);
    expect(bad.type).toBe('custom');
    const good = parseMarkdownImport('x.md', '---\ntype: security\n---\nbody', existing);
    expect(good.type).toBe('security');
  });

  it('always reports source imported_file and strips frontmatter from the body', () => {
    const preview = parseMarkdownImport('x.md', '---\nname: a-b\n---\n# Heading\nBody text', existing);
    expect(preview.source).toBe('imported_file');
    expect(preview.body).not.toContain('---');
    expect(preview.body).toContain('Body text');
  });
});

describe('archive import (.zip)', () => {
  const existing = new Set<string>();

  it('prefers SKILL.md over README.md and other markdown', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Skill\n\nThe skill body.'),
      'README.md': strToU8('# Readme\n\nnot this one'),
      'notes.md': strToU8('# Notes\n\nnot this either'),
    });
    const preview = parseZipImport('bundle.zip', Buffer.from(zip), existing);
    expect(preview.body).toContain('The skill body.');
    expect(preview.ignored_entries.sort()).toEqual(['README.md', 'notes.md']);
  });

  it('falls back to README.md when there is no SKILL.md', () => {
    const zip = zipSync({
      'README.md': strToU8('# Readme\n\nThe readme body.'),
      'other.md': strToU8('# Other\n\nnope'),
    });
    const preview = parseZipImport('bundle.zip', Buffer.from(zip), existing);
    expect(preview.body).toContain('The readme body.');
  });

  it('falls back to the shallowest single *.md, ties broken by path depth then alphabetically', () => {
    const zip = zipSync({
      'deep/nested/z.md': strToU8('# Deep\n\ndeep body'),
      'b.md': strToU8('# B\n\nb body'),
      'a.md': strToU8('# A\n\na body'),
    });
    const preview = parseZipImport('bundle.zip', Buffer.from(zip), existing);
    expect(preview.body).toContain('a body');
  });

  it('lists every non-core member as ignored, and executable-looking members as warnings', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Skill\n\nbody'),
      'scripts/run.sh': strToU8('#!/bin/sh\necho hi'),
      'scripts/tool.py': strToU8('print("hi")'),
      'assets/logo.png': strToU8('not really a png'),
    });
    const preview = parseZipImport('bundle.zip', Buffer.from(zip), existing);
    expect(preview.ignored_entries.sort()).toEqual(
      ['assets/logo.png', 'scripts/run.sh', 'scripts/tool.py'].sort(),
    );
    expect(preview.warnings).toHaveLength(2);
    expect(preview.warnings.every((w) => w.endsWith('not imported, never run'))).toBe(true);
    expect(preview.warnings.some((w) => w.startsWith('scripts/run.sh'))).toBe(true);
    expect(preview.warnings.some((w) => w.startsWith('scripts/tool.py'))).toBe(true);
  });

  it('422s (throws ValidationError) when the archive has no markdown member', () => {
    const zip = zipSync({ 'README.txt': strToU8('no markdown here') });
    expect(() => parseZipImport('bundle.zip', Buffer.from(zip), existing)).toThrow(ValidationError);
  });

  it('rejects an archive with more than MAX_ZIP_MEMBERS entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': strToU8('# Skill\n\nbody') };
    for (let i = 0; i < MAX_ZIP_MEMBERS + 5; i++) {
      files[`file-${i}.txt`] = strToU8('x');
    }
    const zip = zipSync(files);
    expect(() => parseZipImport('bundle.zip', Buffer.from(zip), existing)).toThrow(ValidationError);
  });

  it('rejects an archive exceeding the total uncompressed cap', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Skill\n\nbody'),
      'big.bin': new Uint8Array(MAX_ZIP_UNCOMPRESSED_BYTES + 1024).fill(1),
    });
    expect(() => parseZipImport('bundle.zip', Buffer.from(zip), existing)).toThrow(ValidationError);
  });

  it('rejects when the chosen markdown alone exceeds the markdown cap', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Skill\n\n' + 'x'.repeat(MAX_IMPORT_MARKDOWN_BYTES + 1)),
    });
    expect(() => parseZipImport('bundle.zip', Buffer.from(zip), existing)).toThrow(ValidationError);
  });
});

describe('decodeBase64Capped / importPreviewFromUpload', () => {
  it('rejects an upload exceeding the decoded byte cap', () => {
    const oversized = Buffer.alloc(MAX_IMPORT_UPLOAD_BYTES + 1, 'a');
    expect(() => decodeBase64Capped(oversized.toString('base64'), MAX_IMPORT_UPLOAD_BYTES)).toThrow(
      ValidationError,
    );
  });

  it('accepts an upload at or under the cap', () => {
    const ok = Buffer.alloc(MAX_IMPORT_UPLOAD_BYTES, 'a');
    expect(() => decodeBase64Capped(ok.toString('base64'), MAX_IMPORT_UPLOAD_BYTES)).not.toThrow();
  });

  it('dispatches by extension and rejects an unsupported one', () => {
    const md = Buffer.from('# Title\n\nBody');
    const preview = importPreviewFromUpload('skill.md', md, new Set());
    expect(preview.source).toBe('imported_file');
    expect(() => importPreviewFromUpload('skill.exe', md, new Set())).toThrow(ValidationError);
  });
});

describe('isSkillConfigChange (version-bump predicate, §5.2)', () => {
  const existing = {
    name: 'my-skill',
    description: 'desc',
    type: 'convention' as const,
    body: 'the body',
  };

  it('bumps on a name, description, type, or body change', () => {
    expect(isSkillConfigChange(existing, { name: 'renamed' })).toBe(true);
    expect(isSkillConfigChange(existing, { description: 'new desc' })).toBe(true);
    expect(isSkillConfigChange(existing, { type: 'security' })).toBe(true);
    expect(isSkillConfigChange(existing, { body: 'new body' })).toBe(true);
  });

  it('does NOT bump when a field is patched to its current value', () => {
    expect(isSkillConfigChange(existing, { name: 'my-skill', body: 'the body' })).toBe(false);
  });

  it('does NOT bump on an empty patch (e.g. toggling enabled alone)', () => {
    expect(isSkillConfigChange(existing, {})).toBe(false);
  });
});

describe('stats arithmetic', () => {
  it('ratio is null when the denominator is zero, never a synthetic 0', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });

  it('aggregateFindingRows counts accepted/settled correctly and rolls up by category', () => {
    const now = new Date();
    const agg = aggregateFindingRows([
      { category: 'security', acceptedAt: now, dismissedAt: null },
      { category: 'security', acceptedAt: null, dismissedAt: now },
      { category: 'style', acceptedAt: null, dismissedAt: null },
    ]);
    expect(agg.findings).toBe(3);
    expect(agg.accepted).toBe(1);
    expect(agg.settled).toBe(2);
    expect(agg.by_category.sort((a, b) => a.category.localeCompare(b.category))).toEqual([
      { category: 'security', count: 2 },
      { category: 'style', count: 1 },
    ]);
  });
});
