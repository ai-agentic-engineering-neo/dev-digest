import { describe, it, expect } from 'vitest';
import {
  branchRefs,
  classifyDocPath,
  newSideFromPatch,
  normalizeDocPath,
  parseBodyRefs,
} from '../src/modules/intent/domain/refs.js';

const repo = { owner: 'acme', name: 'api' };
const parse = (body: string) => parseBodyRefs(body, repo, 1);

describe('parseBodyRefs — issues', () => {
  it('detects closing keywords and issue URLs as strong, in order', () => {
    const r = parse(
      'Closes #12\nCloses: #10\nfixes acme/api#3\nResolved #4\nhttps://github.com/acme/api/issues/5 and CLOSES #8',
    );
    const strong = r.issues.filter((i) => i.weight === 'strong').map((i) => i.number);
    expect(strong).toEqual([12, 10, 3, 4, 8]);
    const url = r.issues.find((i) => i.number === 5);
    expect(url).toMatchObject({ weight: 'weak', via: 'url', crossRepo: null });
  });

  it('treats a closing issue URL as strong', () => {
    const r = parse('fixes https://github.com/acme/api/issues/5');
    expect(r.issues).toEqual([{ number: 5, weight: 'strong', crossRepo: null, via: 'keyword' }]);
  });

  it('treats a plain mention as weak and strong wins on duplicates', () => {
    expect(parse('see #7 for context').issues).toEqual([{ number: 7, weight: 'weak', crossRepo: null, via: 'mention' }]);
    const r = parse('see #7, later Fixes #7');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]?.weight).toBe('strong');
  });

  it('ignores HTML entities, comments, fenced code and the PR itself', () => {
    expect(parse('&#123;').issues).toEqual([]);
    expect(parse('<!-- Closes #99 -->').issues).toEqual([]);
    expect(parse('```\n#98\n```').issues).toEqual([]);
    expect(parseBodyRefs('Closes #1', repo, 1).issues).toEqual([]);
  });

  it('marks other repositories as crossRepo', () => {
    const r = parse('fixes other/repo#2');
    expect(r.issues).toEqual([{ number: 2, weight: 'strong', crossRepo: 'other/repo', via: 'keyword' }]);
  });

  it('matches this repo case-insensitively', () => {
    expect(parse('Fixes ACME/Api#9').issues[0]?.crossRepo).toBeNull();
  });
});

describe('branchRefs', () => {
  it('reads a leading number and tracker keys', () => {
    expect(branchRefs('123-fix-bug')).toEqual({ issue: 123, trackerKey: null });
    expect(branchRefs('ABC-42-x')).toEqual({ issue: null, trackerKey: 'ABC-42' });
    expect(branchRefs('feature/login')).toEqual({ issue: null, trackerKey: null });
  });
});

describe('docs and external links', () => {
  it('finds allow-listed docs from tokens, links and blob URLs', () => {
    const r = parse(
      'See plans/foo.md, [spec](server/specs/x.md) and https://github.com/acme/api/blob/main/docs/a.md. README.md is ignored.',
    );
    expect(r.docs).toHaveLength(3);
    expect(r.docs).toEqual(
      expect.arrayContaining([
        { path: 'server/specs/x.md', kind: 'spec' },
        { path: 'docs/a.md', kind: 'doc' },
        { path: 'plans/foo.md', kind: 'plan' },
      ]),
    );
  });

  it('records unsafe paths without turning them into docs', () => {
    const r = parse('[a](../secrets.md) [b](.git/config) [c](/etc/passwd) and C:\\x.md');
    expect(r.docs).toEqual([]);
    expect(r.unsafeDocs).toEqual(expect.arrayContaining(['../secrets.md', '.git/config', '/etc/passwd', 'C:\\x.md']));
  });

  it('keeps only the host of external URLs', () => {
    const r = parse('see https://evil.example/x?token=1 and https://github.com/other/thing/pull/3');
    expect(r.externalHosts).toEqual(['evil.example', 'github.com/other/thing']);
    expect(JSON.stringify(r)).not.toContain('token');
  });

  it('collects tracker keys, capped', () => {
    expect(parse('ABC-1 and DEF-22').trackerKeys).toEqual(['ABC-1', 'DEF-22']);
    expect(parse('A1-1 B1-2 C1-3 D1-4 E1-5 F1-6 G1-7').trackerKeys).toHaveLength(5);
  });
});

describe('normalizeDocPath / classifyDocPath', () => {
  it('normalises and rejects', () => {
    expect(normalizeDocPath('./plans\\foo.md')).toBe('plans/foo.md');
    expect(normalizeDocPath('plans%2Ffoo.md')).toBe('plans/foo.md');
    expect(normalizeDocPath('plans/a.md#sec')).toBe('plans/a.md');
    expect(normalizeDocPath('a/../b.md')).toBeNull();
    expect(normalizeDocPath('/abs.md')).toBeNull();
    expect(normalizeDocPath('C:/x.md')).toBeNull();
    expect(normalizeDocPath('a%00.md')).toBeNull();
    expect(normalizeDocPath('x/.git/y.md')).toBeNull();
    expect(normalizeDocPath('%E0%A4%A')).toBeNull();
  });

  it('applies the allow-list', () => {
    expect(classifyDocPath('plans/x.md')).toBe('plan');
    expect(classifyDocPath('server/specs/x.md')).toBe('spec');
    expect(classifyDocPath('docs/a/b.txt')).toBe('doc');
    expect(classifyDocPath('server/docs/a.mdx')).toBe('doc');
    expect(classifyDocPath('src/readme.md')).toBeNull();
    expect(classifyDocPath('plans/a/b.md')).toBeNull();
  });
});

describe('newSideFromPatch', () => {
  it('returns the full text of a new-file patch', () => {
    expect(newSideFromPatch('@@ -0,0 +1,2 @@\n+# Title\n+body')).toEqual({ text: '# Title\nbody', complete: true });
  });
  it('returns an excerpt for a modified file', () => {
    const r = newSideFromPatch('@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+more');
    expect(r).toEqual({ text: 'keep\nnew\nmore', complete: false });
  });
  it('returns null without a hunk', () => {
    expect(newSideFromPatch('Binary files differ')).toBeNull();
  });
});
