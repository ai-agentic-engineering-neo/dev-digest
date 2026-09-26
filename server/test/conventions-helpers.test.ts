import { describe, it, expect } from 'vitest';
import {
  buildConventionsSkillBody,
  capSamplesForPrompt,
  isConfigFileName,
  normalizeRule,
  truncateSampleFile,
  verifyEvidence,
  type SampleFile,
} from '../src/modules/conventions/helpers.js';

describe('isConfigFileName (C1)', () => {
  it.each([
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    'eslint.config.js',
    'eslint.config.mjs',
    'tsconfig.json',
    'tsconfig.base.json',
    '.prettierrc',
    '.prettierrc.yaml',
    'prettier.config.cjs',
    '.editorconfig',
  ])('matches %s', (name) => {
    expect(isConfigFileName(name)).toBe(true);
  });

  it.each(['index.ts', 'README.md', 'tsconfig.ts', 'package.json'])(
    'does not match %s',
    (name) => {
      expect(isConfigFileName(name)).toBe(false);
    },
  );
});

describe('verifyEvidence (C3)', () => {
  const clonePath = '/repo';
  const sampledPaths = ['src/a.ts'];
  const fileContent = ['line1', 'line2', 'line3', 'line4'].join('\n');

  it('accepts an in-range citation and reads the snippet from the given content', () => {
    const result = verifyEvidence(
      { path: 'src/a.ts', start_line: 2, end_line: 3 },
      { sampledPaths, clonePath, fileContent },
    );
    expect(result).toEqual({ path: 'src/a.ts', startLine: 2, endLine: 3, snippet: 'line2\nline3' });
  });

  it('drops a path that was not sampled', () => {
    expect(
      verifyEvidence(
        { path: 'src/other.ts', start_line: 1, end_line: 1 },
        { sampledPaths, clonePath, fileContent },
      ),
    ).toBeNull();
  });

  it('drops a path-traversal attempt even if it happens to string-match a sampled path prefix', () => {
    expect(
      verifyEvidence(
        { path: '../outside.ts', start_line: 1, end_line: 1 },
        { sampledPaths: ['../outside.ts'], clonePath, fileContent },
      ),
    ).toBeNull();
  });

  it('drops when the file could not be read', () => {
    expect(
      verifyEvidence(
        { path: 'src/a.ts', start_line: 1, end_line: 1 },
        { sampledPaths, clonePath, fileContent: null },
      ),
    ).toBeNull();
  });

  it('drops a line range beyond what the model actually saw', () => {
    expect(
      verifyEvidence(
        { path: 'src/a.ts', start_line: 1, end_line: 999 },
        { sampledPaths, clonePath, fileContent },
      ),
    ).toBeNull();
  });

  it('drops a span wider than 30 lines', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n');
    expect(
      verifyEvidence(
        { path: 'src/a.ts', start_line: 1, end_line: 32 },
        { sampledPaths, clonePath, fileContent: long },
      ),
    ).toBeNull();
  });

  it('drops a start > end', () => {
    expect(
      verifyEvidence(
        { path: 'src/a.ts', start_line: 3, end_line: 2 },
        { sampledPaths, clonePath, fileContent },
      ),
    ).toBeNull();
  });

  it('drops a citation whose lines are all blank', () => {
    expect(
      verifyEvidence(
        { path: 'src/a.ts', start_line: 1, end_line: 1 },
        { sampledPaths, clonePath, fileContent: '   \nreal line' },
      ),
    ).toBeNull();
  });
});

describe('normalizeRule (C6)', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeRule('  Use  CamelCase!!  for   Functions.  ')).toBe(
      'use camelcase for functions',
    );
  });

  it('treats two differently-punctuated phrasings of the same rule as equal', () => {
    expect(normalizeRule('Never swallow errors.')).toBe(normalizeRule('never swallow errors'));
  });
});

describe('buildConventionsSkillBody (C7)', () => {
  it('renders one section per candidate, in order, with a language-tagged fence', () => {
    const body = buildConventionsSkillBody('repo-conventions', 'acme/widgets', [
      {
        category: 'Naming',
        rule: 'Use camelCase.',
        evidence_path: 'src/a.ts',
        evidence_start_line: 1,
        evidence_end_line: 2,
        evidence_snippet: 'const x = 1;',
      },
    ]);
    expect(body).toContain('# repo-conventions');
    expect(body).toContain('acme/widgets');
    expect(body).toContain('## Naming: Use camelCase.');
    expect(body).toContain('Detected in `src/a.ts:1-2`:');
    expect(body).toContain('```ts\nconst x = 1;\n```');
  });
});

describe('capSamplesForPrompt (C1)', () => {
  it('truncates an over-long file to the line cap', () => {
    const content = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n');
    const truncated = truncateSampleFile(content);
    expect(truncated.split('\n')).toHaveLength(400);
  });

  it('drops trailing files once the total exceeds the byte budget, keeping at least one', () => {
    // Each file is already at the 16KB per-file cap after truncation, so 4 of
    // them (64KB) exceed the 60KB total budget and the trailing one is dropped.
    const big = 'x'.repeat(20 * 1024);
    const files: SampleFile[] = [
      { path: 'a.ts', content: big },
      { path: 'b.ts', content: big },
      { path: 'c.ts', content: big },
      { path: 'd.ts', content: big },
    ];
    const out = capSamplesForPrompt(files);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeLessThan(files.length);
    expect(out[0]!.path).toBe('a.ts');
    expect(out.map((f) => f.path)).not.toContain('d.ts');
  });
});
