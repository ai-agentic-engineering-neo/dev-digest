import { describe, it, expect } from 'vitest';
import {
  languageIdForFile,
  languagesPresent,
  labelForLanguageId,
  SUPPORTED_EXT,
  LANGUAGES,
} from '../src/modules/repo-intel/languages/index.js';

/**
 * The single language registry — replaces what used to be three (really
 * four) independently maintained extension allowlists. See
 * docs/go-language-support-plan.md's "Implementation notes" section.
 */
describe('languageIdForFile', () => {
  it('resolves every TS/JS extension to the "typescript" bucket', () => {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
      expect(languageIdForFile(`a${ext}`)).toBe('typescript');
    }
  });

  it('resolves .go to the "go" bucket', () => {
    expect(languageIdForFile('main.go')).toBe('go');
  });

  it('is case-insensitive', () => {
    expect(languageIdForFile('main.GO')).toBe('go');
    expect(languageIdForFile('a.TS')).toBe('typescript');
  });

  it('returns null for an unsupported extension', () => {
    expect(languageIdForFile('README.md')).toBeNull();
    expect(languageIdForFile('main.py')).toBeNull();
  });
});

describe('SUPPORTED_EXT', () => {
  it('is the flattened union of every registered language', () => {
    for (const lang of LANGUAGES) {
      for (const ext of lang.extensions) {
        expect(SUPPORTED_EXT).toContain(ext);
      }
    }
  });
});

describe('labelForLanguageId', () => {
  it('returns the registered label for a known id', () => {
    expect(labelForLanguageId('go')).toBe('Go');
    expect(labelForLanguageId('typescript')).toBe('TypeScript/JavaScript');
  });

  it('falls back to the id itself for an unknown id', () => {
    expect(labelForLanguageId('rust')).toBe('rust');
  });
});

describe('languagesPresent', () => {
  it('returns the distinct, sorted set of languages across the given files', () => {
    expect(languagesPresent(['a.go', 'b.ts', 'c.go', 'd.tsx'])).toEqual(['go', 'typescript']);
  });

  it('excludes files with no recognized extension', () => {
    expect(languagesPresent(['a.go', 'README.md'])).toEqual(['go']);
  });

  it('returns [] for an empty or all-unrecognized file list', () => {
    expect(languagesPresent([])).toEqual([]);
    expect(languagesPresent(['README.md', 'go.mod'])).toEqual([]);
  });
});
