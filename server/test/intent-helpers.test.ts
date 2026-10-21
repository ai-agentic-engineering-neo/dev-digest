import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import { INTENT_PROMPT_VERSION } from '@devdigest/reviewer-core';
import { sourceHash } from '../src/platform/intent-hash.js';
import { SEEDED_INTENT_PROMPT_VERSION } from '../src/db/seed.js';
import {
  applyBudget,
  computeConfidence,
  extractRefs,
  hasLinkedDoc,
  isPlanOrSpecPath,
  normaliseRepoPath,
  redactUrl,
  renderBasis,
} from '../src/modules/reviews/intent-sources.js';

const base = {
  owner: 'acme',
  repo: 'api',
  prNumber: 482,
  title: 'Add rate limiting',
  body: null as string | null,
  branch: 'feat/rate-limit',
  commits: [] as string[],
};

describe('extractRefs: GitHub issues', () => {
  it('finds #N, Closes #N, owner/repo#N and issue URLs; excludes the PR itself', () => {
    const r = extractRefs({
      ...base,
      body: 'Closes #471. Related acme/other#12 and https://github.com/acme/api/issues/99. Self #482.',
    });
    expect(r.issues.map((i) => `${i.repo}#${i.number}`).sort()).toEqual(['api#471', 'api#99']);
    expect(r.skipped.filter((s) => s.reason === 'cross_repo').map((s) => s.ref)).toEqual(['acme/other#12']);
  });

  it('merges GitHub closing references and dedupes', () => {
    const r = extractRefs({ ...base, body: 'fixes #7', closingIssues: [7, 8] });
    expect(r.issues.map((i) => i.number)).toEqual([7, 8]);
  });

  it('skips other owners as cross_repo', () => {
    const r = extractRefs({ ...base, body: 'see evil/repo#5 and https://github.com/evil/repo/issues/6' });
    expect(r.issues).toHaveLength(0);
    expect(r.skipped.filter((s) => s.reason === 'cross_repo').map((s) => s.ref).sort()).toEqual([
      'evil/repo#5',
      'evil/repo#6',
    ]);
  });

  it('skips same-owner other repos as cross_repo', () => {
    const r = extractRefs({ ...base, body: 'see acme/other#5 and https://github.com/acme/other/issues/6' });
    expect(r.issues).toHaveLength(0);
    expect(r.skipped.filter((s) => s.reason === 'cross_repo')).toHaveLength(2);
  });

  it('caps at 5 issues', () => {
    const body = Array.from({ length: 9 }, (_, i) => `#${i + 1}`).join(' ');
    expect(extractRefs({ ...base, body }).issues).toHaveLength(5);
  });
});

describe('extractRefs: tickets', () => {
  it('detects Jira-style keys in title, body and branch', () => {
    const r = extractRefs({ ...base, title: 'ABC-123 fix', body: 'also XYZ-9', branch: 'feat/abc-12-x' });
    expect(r.ticketKeys.sort()).toEqual(['ABC-12', 'ABC-123', 'XYZ-9']);
  });

  it('does not treat UTF-8, SHA-256 or a branch prefix as a ticket', () => {
    const r = extractRefs({ ...base, body: 'uses UTF-8 and SHA-256, RFC-7231', branch: 'fix-12-thing' });
    expect(r.ticketKeys).toEqual([]);
  });
});

describe('extractRefs: docs and external URLs', () => {
  it('finds relative markdown paths and same-repo blob URLs (read at head sha)', () => {
    const r = extractRefs({
      ...base,
      body: 'Plan: docs/plans/rate-limit.md and https://github.com/acme/api/blob/main/specs/a.md?plain=1#L3',
    });
    expect(r.docs.map((d) => d.path).sort()).toEqual(['docs/plans/rate-limit.md', 'specs/a.md']);
    expect(r.docs.every((d) => d.ref === null)).toBe(true);
  });

  it('skips other-repo blob URLs as cross_repo, same owner included', () => {
    const r = extractRefs({ ...base, body: 'https://github.com/acme/wiki/blob/v2/guide.md' });
    expect(r.docs).toHaveLength(0);
    expect(r.skipped).toContainEqual({ kind: 'github_doc', ref: 'acme/wiki:guide.md', reason: 'cross_repo' });
  });

  it('records external URLs as skipped / external_fetch_disabled without query or fragment', () => {
    const r = extractRefs({
      ...base,
      body: 'spec at https://docs.google.com/document/d/abc/edit?token=SECRET#heading=h.1 please',
    });
    const ext = r.skipped.filter((s) => s.kind === 'external_url');
    expect(ext).toEqual([
      { kind: 'external_url', ref: 'https://docs.google.com/document/d/abc/edit', reason: 'external_fetch_disabled' },
    ]);
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect(r.docs).toHaveLength(0);
  });

  it('rejects traversal in a blob URL path', () => {
    const r = extractRefs({ ...base, body: 'https://github.com/acme/api/blob/main/../../etc/x.md' });
    expect(r.docs).toHaveLength(0);
  });
});

describe('normaliseRepoPath', () => {
  it('accepts allowed doc paths and strips a leading ./', () => {
    expect(normaliseRepoPath('./docs/a.md')).toEqual({ ok: true, path: 'docs/a.md' });
    expect(normaliseRepoPath('notes.TXT')).toEqual({ ok: true, path: 'notes.TXT' });
  });

  it.each(['../secret.md', 'a/../b.md', '/etc/passwd.md', '-rf.md', 'a\\b.md', 'a\0b.md', 'a//b.md', ''])(
    'rejects %j as invalid_path',
    (p) => {
      expect(normaliseRepoPath(p)).toEqual({ ok: false, reason: 'invalid_path' });
    },
  );

  it('rejects long paths and non-doc extensions', () => {
    expect(normaliseRepoPath('a/'.repeat(200) + 'x.md')).toEqual({ ok: false, reason: 'invalid_path' });
    expect(normaliseRepoPath('src/index.ts')).toEqual({ ok: false, reason: 'extension_not_allowed' });
  });
});

describe('redactUrl / isPlanOrSpecPath', () => {
  it('keeps origin and pathname only', () => {
    expect(redactUrl('https://x.test/a/b?q=1#f')).toBe('https://x.test/a/b');
  });
  it('recognises plans and specs', () => {
    expect(isPlanOrSpecPath('docs/plans/x.md')).toBe(true);
    expect(isPlanOrSpecPath('server/specs/y.md')).toBe(true);
    expect(isPlanOrSpecPath('feat.plan.md')).toBe(true);
    expect(isPlanOrSpecPath('README.md')).toBe(false);
    expect(isPlanOrSpecPath('docs/plans/x.ts')).toBe(false);
  });
});

describe('computeConfidence', () => {
  it('high with a read issue/doc, medium with a real body, low otherwise', () => {
    expect(computeConfidence({ bodyChars: 0, hasLinkedDoc: true })).toBe('high');
    expect(computeConfidence({ bodyChars: 250, hasLinkedDoc: false })).toBe('medium');
    expect(computeConfidence({ bodyChars: 199, hasLinkedDoc: false })).toBe('low');
    expect(computeConfidence({ bodyChars: 0, hasLinkedDoc: false })).toBe('low');
  });

  it('a ticket key alone, or a failed issue, does not raise confidence', () => {
    const sources: IntentSource[] = [
      { kind: 'ticket_key', ref: 'ABC-1', status: 'skipped', reason: 'no_ticket_provider' },
      { kind: 'github_issue', ref: '#1', status: 'failed', reason: 'not_found_or_no_access' },
    ];
    expect(hasLinkedDoc(sources)).toBe(false);
  });
});

describe('applyBudget', () => {
  const t = (ref: string, n: number) => ({ kind: 'repo_doc' as const, ref, text: 'x'.repeat(n), truncated: false });

  it('leaves everything alone under budget', () => {
    const r = applyBudget({ fixedChars: 100, docs: [t('a', 100)], issues: [t('#1', 100)], commits: ['c'] }, 1000);
    expect(r.docs[0]!.truncated).toBe(false);
    expect(r.commitsTruncated).toBe(false);
  });

  it('trims docs first, then issues, then commits', () => {
    const r = applyBudget(
      { fixedChars: 100, docs: [t('a', 500)], issues: [t('#1', 300)], commits: ['one', 'two'] },
      700,
    );
    expect(r.docs[0]!.truncated).toBe(true);
    expect(r.docs[0]!.text.length).toBeLessThan(500);
    expect(r.issues[0]!.truncated).toBe(false);

    const r2 = applyBudget({ fixedChars: 100, docs: [t('a', 100)], issues: [t('#1', 300)], commits: ['one', 'two'] }, 300);
    expect(r2.docs[0]!.text).toBe('');
    expect(r2.issues[0]!.truncated).toBe(true);
  });

  it('drops the oldest commits last', () => {
    const r = applyBudget({ fixedChars: 95, docs: [], issues: [], commits: ['aaaa', 'bbbb', 'cccc'] }, 100);
    expect(r.commits).toEqual(['aaaa']);
    expect(r.commitsTruncated).toBe(true);
  });
});

describe('sourceHash', () => {
  const h = {
    promptVersion: 1,
    provider: 'openrouter',
    model: 'm',
    title: 't',
    body: 'b',
    branch: 'br',
    headSha: 'abc',
  };
  it('is stable and changes with every input', () => {
    const a = sourceHash(h);
    expect(sourceHash({ ...h })).toBe(a);
    for (const change of [
      { promptVersion: 2 },
      { provider: 'openai' },
      { model: 'n' },
      { title: 'u' },
      { body: 'c' },
      { body: null },
      { branch: 'bx' },
      { headSha: 'def' },
    ]) {
      expect(sourceHash({ ...h, ...change })).not.toBe(a);
    }
  });
});

describe('seed', () => {
  it('claims the current intent prompt version, so the seeded #482 intent is not stale', () => {
    expect(SEEDED_INTENT_PROMPT_VERSION).toBe(INTENT_PROMPT_VERSION);
  });
});

describe('renderBasis', () => {
  it('lists what was actually used', () => {
    const sources: IntentSource[] = [
      { kind: 'title', ref: 'title', status: 'used' },
      { kind: 'branch', ref: 'branch', status: 'used' },
      { kind: 'body', ref: 'description', status: 'skipped', reason: 'empty' },
      { kind: 'commits', ref: '3 commit(s)', status: 'used' },
      { kind: 'github_issue', ref: '#471', status: 'used' },
      { kind: 'external_url', ref: 'https://x.test/a', status: 'skipped' },
    ];
    expect(renderBasis(sources)).toEqual(['title', 'branch', 'commit messages', 'issue #471']);
  });
});
