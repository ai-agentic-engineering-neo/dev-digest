import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importSkillFromFile } from '../src/modules/skills/import.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Unit coverage for `importSkillFromFile` — pure `.md`/`.txt`/`.zip` parsing,
 * no DB write (see `SkillsService.importFromFile`). No file-upload plugin
 * exists in this codebase; the client posts `{ filename, content_base64 }` as
 * plain JSON, so these tests build that same base64 payload directly.
 */

function b64(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString('base64');
}

describe('importSkillFromFile', () => {
  it('plain .md: decodes the body directly and derives name from the first heading', () => {
    const body = '# My Great Rubric\n\nSome body text.\n';
    const result = importSkillFromFile({
      filename: 'my-great-rubric.md',
      content_base64: b64(body),
    });
    expect(result.body).toBe(body);
    expect(result.name).toBe('My Great Rubric');
    expect(result.warnings).toEqual([]);
  });

  it('.txt falls back to the filename (no extension) when there is no heading', () => {
    const body = 'Just plain text, no heading.';
    const result = importSkillFromFile({
      filename: 'notes.txt',
      content_base64: b64(body),
    });
    expect(result.body).toBe(body);
    expect(result.name).toBe('notes');
    expect(result.warnings).toEqual([]);
  });

  it('.zip with a markdown entry + a decoy file: returns only the markdown content and warns about the decoy', () => {
    const mdBody = '# Zipped Skill\n\nRubric body from the archive.\n';
    const zipped = zipSync({
      'skill.md': strToU8(mdBody),
      'notes.txt': strToU8('ignore me — not markdown'),
      'image.png': strToU8('not-a-real-png-but-irrelevant'),
    });
    const result = importSkillFromFile({
      filename: 'skill-bundle.zip',
      content_base64: b64(zipped),
    });
    expect(result.body).toBe(mdBody);
    expect(result.name).toBe('Zipped Skill');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/ignored 2 other file\(s\) in the archive/);
  });

  it('.zip with a markdown entry and NO other files: no warnings', () => {
    const mdBody = '# Solo\n\nBody.\n';
    const zipped = zipSync({ 'solo.md': strToU8(mdBody) });
    const result = importSkillFromFile({
      filename: 'solo.zip',
      content_base64: b64(zipped),
    });
    expect(result.body).toBe(mdBody);
    expect(result.warnings).toEqual([]);
  });

  it('.zip with NO markdown entry: throws a 400 AppError', () => {
    const zipped = zipSync({
      'readme.txt': strToU8('no markdown here'),
      'data.json': strToU8('{}'),
    });
    expect(() =>
      importSkillFromFile({ filename: 'no-markdown.zip', content_base64: b64(zipped) }),
    ).toThrow(AppError);
    try {
      importSkillFromFile({ filename: 'no-markdown.zip', content_base64: b64(zipped) });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toBe('No markdown file found in archive');
    }
  });

  it('.zip ignores directory entries when looking for markdown and counting others', () => {
    const mdBody = '# Nested\n\nBody.\n';
    const zipped = zipSync({
      'pkg/': new Uint8Array(0),
      'pkg/skill.md': strToU8(mdBody),
    });
    const result = importSkillFromFile({
      filename: 'pkg.zip',
      content_base64: b64(zipped),
    });
    expect(result.body).toBe(mdBody);
    // The directory entry itself must not be counted as "another file".
    expect(result.warnings).toEqual([]);
  });

  it('an unsupported extension throws a 400 AppError', () => {
    expect(() =>
      importSkillFromFile({ filename: 'skill.pdf', content_base64: b64('whatever') }),
    ).toThrow(AppError);
  });
});
