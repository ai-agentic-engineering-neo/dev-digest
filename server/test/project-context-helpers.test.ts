import { describe, it, expect } from 'vitest';
import {
  applyPromptBudget,
  attachedLine,
  expandBraces,
  globToPathspecs,
  isExcludedPath,
  isProbablyBinary,
  overrideTextIssue,
  kindOf,
  resolveContextOrder,
  safeTokenCount,
  summaryLine,
  toSpecFile,
  truncateToTokens,
  validateAttachPaths,
} from '../src/modules/project-context/helpers.js';

const DEFAULT_GLOB = '**/{specs,docs,insights}/**/*.md';

describe('discovery glob', () => {
  it('expands braces into git pathspecs (AC-2)', () => {
    expect(globToPathspecs(DEFAULT_GLOB)).toEqual([
      '**/specs/**/*.md',
      '**/docs/**/*.md',
      '**/insights/**/*.md',
    ]);
    expect(expandBraces('a/{b,c{d,e}}/f')).toEqual(['a/b/f', 'a/cd/f', 'a/ce/f']);
    expect(expandBraces('plain/*.md')).toEqual(['plain/*.md']);
  });

  it('excludes node_modules, dot folders, control chars and unsafe paths (AC-3)', () => {
    expect(isExcludedPath('docs/a.md')).toBe(false);
    expect(isExcludedPath('node_modules/x/docs/a.md')).toBe(true);
    expect(isExcludedPath('pkg/node_modules/docs/a.md')).toBe(true);
    expect(isExcludedPath('.github/docs/a.md')).toBe(true);
    expect(isExcludedPath('docs/.hidden/a.md')).toBe(true);
    expect(isExcludedPath('docs/a\nb.md')).toBe(true);
    expect(isExcludedPath('../docs/a.md')).toBe(true);
    expect(isExcludedPath('/docs/a.md')).toBe(true);
    expect(isExcludedPath('-docs/a.md')).toBe(true);
  });

  it('kind is the nearest ancestor among specs, docs, insights (AC-4)', () => {
    expect(kindOf('specs/a.md')).toBe('specs');
    expect(kindOf('server/docs/specs/a.md')).toBe('specs');
    expect(kindOf('specs/docs/a.md')).toBe('docs');
    expect(kindOf('a/insights/b/c.md')).toBe('insights');
    expect(kindOf('docs.md')).toBeNull();
    expect(kindOf('src/docs.md')).toBeNull();
  });

  it('maps a listed file to a SpecFile; too large has no tokens (AC-6)', () => {
    expect(toSpecFile({ path: 'docs/a.md', size: 10, tokens: 3, tooLarge: false }, { agents: 2, skills: 1 })).toMatchObject({
      kind: 'docs', tokens: 3, too_large: false, agent_count: 2, skill_count: 1,
    });
    expect(toSpecFile({ path: 'docs/b.md', size: 999_999, tokens: 5, tooLarge: true }).tokens).toBeNull();
  });
});

describe('validateAttachPaths', () => {
  const listing = new Map([
    ['docs/a.md', { tooLarge: false }],
    ['docs/big.md', { tooLarge: true }],
  ]);
  it('accepts listed attachable paths once each', () => {
    expect(validateAttachPaths(['docs/a.md'], listing)).toEqual([]);
  });
  it('reports duplicates, unknown and too large paths', () => {
    expect(validateAttachPaths(['docs/a.md', 'docs/a.md', 'x.md', 'docs/big.md'], listing)).toEqual([
      { path: 'docs/a.md', reason: 'duplicate' },
      { path: 'x.md', reason: 'unknown' },
      { path: 'docs/big.md', reason: 'too_large' },
    ]);
  });
});

describe('resolveContextOrder (AC-27, AC-28, EC-6, EC-7)', () => {
  it('agent paths first, then each skill in order; first occurrence wins', () => {
    expect(
      resolveContextOrder(['a.md', 'b.md'], [
        { name: 's1', paths: ['b.md', 'c.md'] },
        { name: 's2', paths: ['c.md', 'd.md'] },
      ]),
    ).toEqual([
      { path: 'a.md', source: 'agent' },
      { path: 'b.md', source: 'agent' },
      { path: 'c.md', source: 'skill:s1' },
      { path: 'd.md', source: 'skill:s2' },
    ]);
  });
  it('skill documents apply when the agent attaches nothing; no skills = nothing', () => {
    expect(resolveContextOrder([], [{ name: 's', paths: ['x.md'] }])).toEqual([{ path: 'x.md', source: 'skill:s' }]);
    expect(resolveContextOrder([], [])).toEqual([]);
  });
  it('a disabled skill is simply not passed in', () => {
    expect(resolveContextOrder(['a.md'], [])).toEqual([{ path: 'a.md', source: 'agent' }]);
  });
});

describe('budgets', () => {
  const count = (t: string) => t.length;
  it('truncateToTokens cuts to the limit and flags it (AC-33)', () => {
    expect(truncateToTokens('abcdef', 4, count)).toEqual({ text: 'abcd', truncated: true });
    expect(truncateToTokens('abc', 4, count)).toEqual({ text: 'abc', truncated: false });
  });
  it('applyPromptBudget skips the overflowing document and every later one (AC-34)', () => {
    const docs = [{ tokens: 5 }, { tokens: 6 }, { tokens: 1 }];
    expect(applyPromptBudget(docs, 10)).toEqual({ kept: [docs[0]], skipped: [docs[1], docs[2]] });
    expect(applyPromptBudget(docs, 100).skipped).toEqual([]);
  });
  it('detects non UTF-8 text (D16)', () => {
    expect(isProbablyBinary('ok')).toBe(false);
    expect(isProbablyBinary('a\0b')).toBe(true);
    expect(isProbablyBinary('a�b')).toBe(true);
  });
  it('log lines (AC-38)', () => {
    expect(attachedLine('docs/a.md', 12, 'skill:x')).toBe('Context attached: docs/a.md (12 tokens, skill:x)');
    expect(attachedLine('docs/a.md', 12, 'agent', true)).toBe(
      'Context attached: docs/a.md (12 tokens, agent, modified locally)',
    );
    expect(summaryLine(2, 30)).toBe('Context: 2 documents, 30 tokens');
  });
});

describe('safeTokenCount (long unspaced text cannot stall the tokenizer)', () => {
  it('approximates a long whitespace-free text as chars/4 without calling the tokenizer, and quickly', () => {
    const count = () => {
      throw new Error('tokenizer must not see pathological text');
    };
    const text = 'x'.repeat(200_000);
    const start = Date.now();
    expect(safeTokenCount(count, text)).toBe(50_000);
    expect(Date.now() - start).toBeLessThan(1000);
    // truncation over such text stays on the approximation too
    expect(truncateToTokens(text, 8000, (t) => safeTokenCount(count, t))).toEqual({
      text: 'x'.repeat(32_000),
      truncated: true,
    });
  });

  it('keeps using the tokenizer for normal text and for short unspaced runs', () => {
    const count = (t: string) => t.length + 1;
    expect(safeTokenCount(count, 'normal words here')).toBe(18);
    expect(safeTokenCount(count, 'x'.repeat(2000))).toBe(2001);
    expect(safeTokenCount(count, `${'x'.repeat(2000)} ${'y'.repeat(2000)}`)).toBe(4002);
    expect(safeTokenCount(count, 'x'.repeat(2001))).toBe(Math.ceil(2001 / 4));
  });
});

describe('overrideTextIssue (AC-47, D4)', () => {
  it('rejects empty, over-cap and NUL text; accepts the rest', () => {
    expect(overrideTextIssue('')).toBe('empty');
    expect(overrideTextIssue('x'.repeat(200_001))).toBe('too_long');
    expect(overrideTextIssue('a\0b')).toBe('nul');
    expect(overrideTextIssue('x'.repeat(200_000))).toBeNull();
    expect(overrideTextIssue('ok')).toBeNull();
  });
});

describe('toSpecFile with an override', () => {
  const file = { path: 'docs/a.md', size: 10, tokens: 3, tooLarge: false, blob: 'b' };
  it('sets modified and uses the override token count', () => {
    expect(toSpecFile(file, undefined, { tokens: 9 })).toMatchObject({ modified: true, tokens: 9 });
    expect(toSpecFile(file)).toMatchObject({ modified: false, tokens: 3 });
  });
  it('ignores an override of a too_large file', () => {
    expect(toSpecFile({ ...file, tooLarge: true }, undefined, { tokens: 9 })).toMatchObject({
      modified: false,
      tokens: null,
    });
  });
});
