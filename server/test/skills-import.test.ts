import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  parseMarkdownImport,
  parseSkillImport,
  parseZipImport,
  SkillImportError,
} from '../src/modules/skills/import.js';

/**
 * S1/S6 import parsing — pure, no DB. Covers: ignored files' bytes are never
 * read, a `../`-bearing zip entry name doesn't choke (no disk writes happen
 * anywhere, so this is about not crashing, not an FS-escape), the no-md and
 * over-size-limit 422 paths, and frontmatter extraction.
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('parseZipImport — SKILL.md + ignored files (S1)', () => {
  it('puts every other file in ignored_files and never reads its bytes', () => {
    const marker = 'echo "this must never appear in the preview"';
    const zip = zipSync({
      'SKILL.md': strToU8('---\nname: Bundled Skill\ndescription: A bundled skill\ntype: convention\n---\nReview for X.'),
      'run.sh': strToU8(marker),
    });

    const preview = parseZipImport('bundle.zip', zip);

    expect(preview.name).toBe('Bundled Skill');
    expect(preview.body).toBe('Review for X.');
    expect(preview.ignored_files).toEqual(['run.sh']);
    // The ignored file's content never made it into the preview anywhere.
    expect(JSON.stringify(preview)).not.toContain(marker);
  });
});

describe('parseZipImport — path-traversal-shaped entry names', () => {
  it('handles a `../` entry name without throwing or reading its bytes', () => {
    const zip = zipSync({
      '../evil.txt': strToU8('should never be read'),
      'SKILL.md': strToU8('---\nname: Safe\n---\nBody.'),
    });

    const preview = parseZipImport('bundle.zip', zip);

    expect(preview.name).toBe('Safe');
    expect(preview.ignored_files).toEqual(['../evil.txt']);
  });
});

describe('parseZipImport — no markdown in the archive', () => {
  it('throws a SkillImportError when there is no SKILL.md and no single .md fallback', () => {
    const zip = zipSync({ 'notes.txt': strToU8('not markdown') });
    expect(() => parseZipImport('bundle.zip', zip)).toThrow(SkillImportError);
  });
});

describe('parseSkillImport — size limit', () => {
  it('rejects an import over the 1 MB size limit', () => {
    const oversized = toBase64(new Uint8Array(1024 * 1024 + 10));
    expect(() => parseSkillImport('big.md', oversized)).toThrow(SkillImportError);
  });
});

describe('parseMarkdownImport — frontmatter', () => {
  it('extracts name/description/type from frontmatter; body is the remainder', () => {
    const content = [
      '---',
      'name: Security Review',
      'description: Flags injection and auth bugs',
      'type: security',
      '---',
      'Look for SQL injection and missing auth checks.',
    ].join('\n');

    const preview = parseMarkdownImport('security.md', content);

    expect(preview.name).toBe('Security Review');
    expect(preview.description).toBe('Flags injection and auth bugs');
    expect(preview.type).toBe('security');
    expect(preview.body).toBe('Look for SQL injection and missing auth checks.');
    expect(preview.warnings).toEqual([]);
  });

  it('flags a missing-frontmatter file with a warning and infers name from the filename', () => {
    const preview = parseMarkdownImport('plain-rules.md', 'Just body text, no frontmatter.');

    expect(preview.name).toBe('plain-rules');
    expect(preview.body).toBe('Just body text, no frontmatter.');
    expect(preview.warnings.length).toBeGreaterThan(0);
  });
});
