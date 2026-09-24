import { describe, it, expect } from 'vitest';
import { ruleKey, safeRelativePath, verifyEvidence } from '../src/modules/conventions/domain/evidence.js';
import { gateCandidates, citedPaths, type Candidate } from '../src/modules/conventions/domain/gate.js';
import {
  isConfigFile,
  numberLines,
  pickConfigFiles,
  pickFallbackSources,
  renderSample,
} from '../src/modules/conventions/domain/sampling.js';
import { mockConventionsFor } from '../src/adapters/llm/mock.js';
import { extractionUserMessage } from '../src/modules/conventions/domain/extraction.js';

const FILE = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
];

describe('safeRelativePath', () => {
  it('normalizes ./ and backslashes', () => {
    expect(safeRelativePath('./src/a.ts')).toBe('src/a.ts');
    expect(safeRelativePath('src\\lib\\a.ts')).toBe('src/lib/a.ts');
  });
  it.each(['../etc/passwd', 'src/../../x', '/etc/passwd', 'C:/x', 'a//b', '', 'a/\0b', 'src/./a.ts'])(
    'rejects %j',
    (p) => expect(safeRelativePath(p)).toBeNull(),
  );
});

describe('verifyEvidence', () => {
  const claim = (start: number, end: number, snippet: string) => ({ path: 'src/a.ts', start_line: start, end_line: end, snippet });

  it('keeps an exact citation and stores the REAL lines', () => {
    const r = verifyEvidence(FILE, claim(4, 6, 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });'));
    expect(r).toEqual({
      ok: true,
      evidence: {
        path: 'src/a.ts',
        start_line: 4,
        end_line: 6,
        snippet: 'const user = await db.users.find(id);\n\nconst posts = await db.posts.findMany({ userId: id });',
      },
    });
  });

  it('relocates a correct snippet cited at the wrong lines', () => {
    const r = verifyEvidence(FILE, claim(1, 1, 'return { user, posts };'));
    expect(r.ok && r.evidence.start_line).toBe(7);
  });

  it('strips a copied line-number prefix and ignores indentation', () => {
    const r = verifyEvidence(FILE, claim(4, 4, '   4|     const user = await db.users.find(id);'));
    expect(r.ok && r.evidence.start_line).toBe(4);
  });

  it('accepts a long partial line, rejects invented code', () => {
    expect(verifyEvidence(FILE, claim(6, 6, 'db.posts.findMany({ userId')).ok).toBe(true);
    expect(verifyEvidence(FILE, claim(4, 4, 'const user = await db.users.findOne(id);'))).toEqual({
      ok: false,
      reason: 'snippet_mismatch',
    });
  });

  it('reports line_out_of_range when the cited range is past EOF and nothing matches', () => {
    expect(verifyEvidence(FILE, claim(99, 99, 'nope()'))).toEqual({ ok: false, reason: 'line_out_of_range' });
  });

  it('treats an empty snippet as invalid', () => {
    expect(verifyEvidence(FILE, claim(1, 1, '  \n'))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('prefers the occurrence nearest to the cited line', () => {
    const lines = ['x = 1;', 'call();', 'y = 2;', 'call();'];
    const r = verifyEvidence(lines, { path: 'a', start_line: 4, end_line: 4, snippet: 'call();' });
    expect(r.ok && r.evidence.start_line).toBe(4);
  });
});

describe('gateCandidates', () => {
  const cand = (rule: string, path: string, snippet: string, line = 1): Candidate => ({
    category: 'async',
    rule,
    confidence: 0.8,
    evidence: [{ path, start_line: line, end_line: line, snippet }],
  });
  const files: Record<string, string[]> = { 'src/a.ts': FILE };
  const lines = (p: string) => files[p] ?? null;

  it('keeps verified candidates and reports every drop with its reason', () => {
    const { kept, dropped } = gateCandidates(
      [
        cand('Use async/await, never .then()', 'src/a.ts', 'const user = await db.users.find(id);', 4),
        cand('Missing file', 'src/nope.ts', 'x'),
        cand('Escapes the clone', '../../etc/passwd', 'root:x'),
        cand('Invented code', 'src/a.ts', 'totally.invented()', 2),
        cand('use ASYNC/await — never .then()!', 'src/a.ts', 'return { user, posts };'),
        cand('Already rejected before', 'src/a.ts', 'return { user, posts };'),
      ],
      lines,
      new Set([ruleKey('Already rejected before')]),
    );
    expect(kept.map((k) => k.rule)).toEqual(['Use async/await, never .then()']);
    expect(dropped.map((d) => d.reason)).toEqual([
      'file_not_found',
      'file_not_found',
      'snippet_mismatch',
      'duplicate',
      'duplicate',
    ]);
  });

  it('keeps the verified evidence items of a candidate and drops the rest', () => {
    const c: Candidate = {
      category: 'naming',
      rule: 'r',
      confidence: 3,
      evidence: [
        { path: 'src/nope.ts', start_line: 1, end_line: 1, snippet: 'x' },
        { path: 'src/a.ts', start_line: 7, end_line: 7, snippet: 'return { user, posts };' },
        { path: 'src/a.ts', start_line: 7, end_line: 7, snippet: 'return { user, posts };' },
      ],
    };
    const { kept } = gateCandidates([c], lines, new Set());
    expect(kept[0]!.evidence).toHaveLength(1);
    expect(kept[0]!.confidence).toBe(1);
  });

  it('citedPaths skips unsafe paths', () => {
    expect(citedPaths([cand('a', 'src/a.ts', 'x'), cand('b', '/etc/passwd', 'x')])).toEqual(['src/a.ts']);
  });
});

describe('sampling', () => {
  it('recognizes configs at the root and depth 1 only', () => {
    expect(isConfigFile('tsconfig.base.json')).toBe(true);
    expect(isConfigFile('server/.eslintrc.cjs')).toBe(true);
    expect(isConfigFile('AGENTS.md')).toBe(true);
    expect(isConfigFile('a/b/package.json')).toBe(false);
    expect(isConfigFile('src/index.ts')).toBe(false);
    expect(pickConfigFiles(['server/package.json', 'package.json', 'src/a.ts'])).toEqual([
      'package.json',
      'server/package.json',
    ]);
  });

  it('fallback spreads across directories and skips tests/generated', () => {
    const paths = [
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'lib/x.py',
      'src/a.test.ts',
      'test/y.ts',
      'src/types.d.ts',
      'vitest.config.ts',
      'web/next.config.mjs',
      'README.md',
    ];
    expect(pickFallbackSources(paths, 3)).toEqual(['lib/x.py', 'src/a.ts', 'src/b.ts']);
  });

  it('numbers lines and truncates', () => {
    expect(numberLines('a\nb', 100)).toBe('1| a\n2| b');
    expect(numberLines('aaaa\nbbbb\ncccc', 16)).toBe('1| aaaa\n2| bbbb\n… (truncated, 1 more lines)');
  });

  it('renders file blocks and lists what fit', () => {
    const r = renderSample([
      { path: 'package.json', kind: 'config', content: '{}' },
      { path: 'src/a.ts', kind: 'source', content: 'x' },
    ]);
    expect(r.included).toEqual(['package.json', 'src/a.ts']);
    expect(r.text).toContain('=== FILE: src/a.ts (source) ===\n1| x');
  });
});

describe('mock LLM conventions fixture', () => {
  it('cites real sampled lines that pass the gate, plus one bogus candidate', () => {
    const sample = renderSample([{ path: 'src/a.ts', kind: 'source', content: FILE.join('\n') }]).text;
    const { candidates } = mockConventionsFor([{ content: extractionUserMessage('o/r', sample) }]);
    expect(candidates).toHaveLength(2);
    const { kept, dropped } = gateCandidates(candidates, (p) => (p === 'src/a.ts' ? FILE : null), new Set());
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence[0]!.start_line).toBe(1);
    expect(dropped).toEqual([expect.objectContaining({ reason: 'file_not_found' })]);
  });
});
