import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import {
  buildConventionsSkillDraft,
  dedupeConventions,
  evidenceRef,
  groundCandidate,
  isSafeRelativePath,
  locateSnippet,
  type GroundedConvention,
} from '../src/modules/conventions/domain.js';

const FILE = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const raw = (over: Partial<Parameters<typeof groundCandidate>[0]> = {}) => ({
  category: 'async',
  rule: 'Always use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
  confidence: 0.91,
  ...over,
});

describe('locateSnippet', () => {
  it('matches ignoring indentation and blank lines; returns 1-based lines', () => {
    expect(
      locateSnippet(FILE, 'const user = await db.users.find(id);\n   const posts = await db.posts.findMany({ userId: id });'),
    ).toEqual({ lineStart: 4, lineEnd: 6 });
  });

  it('collapses inner whitespace but requires the same tokens in order', () => {
    expect(locateSnippet(FILE, 'return {   user,  posts };')).toEqual({ lineStart: 7, lineEnd: 7 });
    expect(locateSnippet(FILE, 'return { posts, user };')).toBeNull();
  });

  it('rejects a paraphrased line in the middle', () => {
    expect(locateSnippet(FILE, 'const user = await db.users.find(id);\nconst posts = await db.posts.list();')).toBeNull();
  });

  it('handles CRLF files', () => {
    expect(locateSnippet(FILE.replace(/\n/g, '\r\n'), 'return { user, posts };')).toEqual({
      lineStart: 7,
      lineEnd: 7,
    });
  });
});

describe('isSafeRelativePath', () => {
  it.each([
    ['src/a.ts', true],
    ['../etc/passwd', false],
    ['src/../../x', false],
    ['/etc/passwd', false],
    ['C:\\Windows\\x', false],
    ['', false],
  ])('%s → %s', (p, ok) => expect(isSafeRelativePath(p)).toBe(ok));
});

describe('groundCandidate', () => {
  it('keeps a candidate whose snippet is really in the file, with real lines and real code', () => {
    const g = groundCandidate(raw({ evidence_path: './src/api/users.ts' }), FILE);
    expect(g).toEqual({
      ok: true,
      value: {
        category: 'async',
        rule: 'Always use async/await instead of .then() chains',
        evidencePath: 'src/api/users.ts',
        evidenceSnippet: '  const user = await db.users.find(id);\n\n  const posts = await db.posts.findMany({ userId: id });',
        lineStart: 4,
        lineEnd: 6,
        confidence: 0.91,
      },
    });
  });

  it('drops candidates without evidence: missing file, invented code, trivial snippet, unsafe path', () => {
    expect(groundCandidate(raw(), null)).toEqual({ ok: false, reason: 'file_not_found' });
    expect(groundCandidate(raw({ evidence_snippet: 'users.then(render)' }), FILE)).toEqual({
      ok: false,
      reason: 'snippet_not_found',
    });
    expect(groundCandidate(raw({ evidence_snippet: '}' }), FILE)).toEqual({ ok: false, reason: 'snippet_too_short' });
    expect(groundCandidate(raw({ evidence_path: '../secrets.env' }), FILE)).toEqual({
      ok: false,
      reason: 'unsafe_path',
    });
  });

  it('clamps confidence into 0..1', () => {
    const g = groundCandidate(raw({ confidence: 7 }), FILE);
    expect(g.ok && g.value.confidence).toBe(1);
  });
});

describe('dedupeConventions', () => {
  const g = (rule: string): GroundedConvention => ({
    category: 'x',
    rule,
    evidencePath: 'a.ts',
    evidenceSnippet: 's',
    lineStart: 1,
    lineEnd: 1,
    confidence: 0.5,
  });
  it('drops duplicates of each other and of accepted rules (case/punctuation-insensitive)', () => {
    const out = dedupeConventions([g('Use await.'), g('use AWAIT'), g('Wrap errors'), g('Prefer Result<T>')], [
      'prefer result t',
    ]);
    expect(out.map((c) => c.rule)).toEqual(['Use await.', 'Wrap errors']);
  });
});

describe('buildConventionsSkillDraft', () => {
  const c = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
    id: 'c1',
    category: 'async',
    rule: 'Always use async/await instead of .then() chains',
    evidence_path: 'src/api/users.ts',
    evidence_snippet: 'const user = await db.users.find(id);',
    line_start: 23,
    line_end: 31,
    confidence: 0.9,
    status: 'accepted',
    ...over,
  });

  it('merges accepted conventions into one <repo>-conventions skill with evidence', () => {
    const d = buildConventionsSkillDraft('payments-api', [
      c({}),
      c({ id: 'c2', rule: 'Redis access goes through src/lib/redis.ts singleton', evidence_path: 'src/lib/redis.ts', line_start: 1, line_end: 1 }),
    ]);
    expect(d.name).toBe('payments-api-conventions');
    expect(d.type).toBe('convention');
    expect(d.convention_ids).toEqual(['c1', 'c2']);
    expect(d.evidence_files).toEqual(['src/api/users.ts', 'src/lib/redis.ts']);
    expect(d.body).toContain('# payments-api-conventions');
    expect(d.body).toContain('## always-use-async-await-instead-of-then-chains');
    expect(d.body).toContain('Detected in `src/api/users.ts:23-31`:');
    expect(d.body).toContain('Detected in `src/lib/redis.ts:1`:');
    expect(d.description).toMatch(/^Use when reviewing changes to payments-api/);
  });

  it('uses a longer fence when the snippet itself contains a code fence', () => {
    const d = buildConventionsSkillDraft('docs', [c({ evidence_snippet: '```ts\nx\n```' })]);
    expect(d.body).toContain('````\n```ts\nx\n```\n````');
  });

  it('formats evidence refs', () => {
    expect(evidenceRef({ evidence_path: 'a.ts', line_start: null, line_end: null })).toBe('a.ts');
  });
});
