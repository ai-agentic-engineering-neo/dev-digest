import { describe, it, expect } from 'vitest';
import { CONTEXT_TOKEN_CAP } from '../src/modules/context/constants.js';
import {
  classifyDocPath,
  estimateTokens,
  selectForRun,
  type AgentContextDocs,
  type ContextDocContent,
  type ContextDocList,
} from '../src/modules/context/domain.js';
import {
  AgentContextDocsSchema,
  ContextDocContentSchema,
  ContextDocListSchema,
  ContextDocSchema,
  SetAgentContextDocsBody,
} from '../src/modules/context/schemas.js';

const text = (tokens: number) => 'x'.repeat(tokens * 4);

describe('classifyDocPath (AC-1)', () => {
  it('classifies discoverable docs', () => {
    expect(classifyDocPath('README.md')).toBe('readme');
    expect(classifyDocPath('server/README.md')).toBe('readme');
    expect(classifyDocPath('client/INSIGHTS.md')).toBe('insights');
    expect(classifyDocPath('INSIGHTS.md')).toBe('insights');
    expect(classifyDocPath('specs/x.md')).toBe('specs');
    expect(classifyDocPath('server/specs/deep/y.md')).toBe('specs');
    expect(classifyDocPath('docs/a/b.MD')).toBe('docs');
  });

  it('rejects everything else', () => {
    for (const p of [
      'a/b/README.md',
      'node_modules/p/docs/a.md',
      'server/src/vendor/docs/a.md',
      'clones/x/README.md',
      '.git/docs/a.md',
      'docs/a.txt',
      '../docs/a.md',
      '/docs/a.md',
      'docs\\a.md',
      'docs//a.md',
      'C:/docs/a.md',
      'src/app.ts',
      'notes.md',
      '',
      `docs/${'a'.repeat(1100)}.md`,
    ]) {
      expect(classifyDocPath(p), p).toBeNull();
    }
  });
});

describe('estimateTokens (AC-1)', () => {
  it('is ceil(chars / 4)', () => {
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('selectForRun (AC-9, AC-10)', () => {
  it('skips too-large docs, stops at the cap, and leaves every later doc out with its own reason', () => {
    const sel = selectForRun(
      [
        { path: 'a.md', content: text(1000) },
        { path: 'big.md', content: text(5000) },
        { path: 'b.md', content: text(2500) },
        { path: 'c.md', content: text(1000) },
        { path: 'd.md', content: text(10) },
        { path: 'gone.md', content: null },
        { path: 'huge.md', content: text(4500) },
      ],
      CONTEXT_TOKEN_CAP,
    );
    expect(sel.included.map((d) => [d.path, d.tokens])).toEqual([
      ['a.md', 1000],
      ['b.md', 2500],
    ]);
    expect(sel.total_tokens).toBe(3500);
    expect(sel.left_out).toEqual([
      { path: 'big.md', tokens: 5000, reason: 'too_large' },
      { path: 'c.md', tokens: 1000, reason: 'over_cap' },
      // once the cap is hit, a small doc that would still fit is NOT included
      { path: 'd.md', tokens: 10, reason: 'over_cap' },
      { path: 'gone.md', tokens: null, reason: 'missing' },
      { path: 'huge.md', tokens: 4500, reason: 'too_large' },
    ]);
  });

  it('a missing doc does not stop later docs before the cap is hit', () => {
    const sel = selectForRun(
      [
        { path: 'gone.md', content: null },
        { path: 'a.md', content: text(100) },
      ],
      CONTEXT_TOKEN_CAP,
    );
    expect(sel.included.map((d) => d.path)).toEqual(['a.md']);
    expect(sel.left_out).toEqual([{ path: 'gone.md', tokens: null, reason: 'missing' }]);
  });

  it('never truncates included content and accepts a doc exactly at the cap', () => {
    const body = text(4000);
    const sel = selectForRun([{ path: 'a.md', content: body }], CONTEXT_TOKEN_CAP);
    expect(sel.included[0]!.content).toBe(body);
    expect(sel.total_tokens).toBe(4000);
  });
});

describe('schemas', () => {
  const repoId = '11111111-1111-4111-8111-111111111111';
  const agentId = '22222222-2222-4222-8222-222222222222';

  it('parse a sample of every DTO', () => {
    const doc = { path: 'docs/a.md', source: 'docs', tokens: 3, attached_agents: 1 } as const;
    expect(ContextDocSchema.parse(doc)).toEqual(doc);

    const lists: ContextDocList[] = [
      { repo_id: repoId, state: { status: 'ready' }, docs: [doc] },
      { repo_id: repoId, state: { status: 'not_cloned' }, docs: [] },
      { repo_id: repoId, state: { status: 'index_failed', reason: 'boom' }, docs: [doc] },
      { repo_id: repoId, state: { status: 'index_degraded', reason: null }, docs: [doc] },
    ];
    for (const l of lists) expect(ContextDocListSchema.parse(l)).toEqual(l);

    const content: ContextDocContent = { ...doc, content: '# A' };
    expect(ContextDocContentSchema.parse(content)).toEqual(content);

    const agentDocs: AgentContextDocs = {
      agent_id: agentId,
      repo_id: repoId,
      docs: [
        { path: 'docs/a.md', position: 0, status: 'ok', source: 'docs', tokens: 3 },
        { path: 'docs/gone.md', position: 1, status: 'missing', source: null, tokens: null },
      ],
    };
    expect(AgentContextDocsSchema.parse(agentDocs)).toEqual(agentDocs);
  });

  it('rejects an unknown repo state and an oversized body', () => {
    expect(
      ContextDocListSchema.safeParse({ repo_id: repoId, state: { status: 'weird' }, docs: [] }).success,
    ).toBe(false);
    expect(
      SetAgentContextDocsBody.safeParse({ repo_id: repoId, paths: Array.from({ length: 201 }, (_, i) => `docs/${i}.md`) })
        .success,
    ).toBe(false);
  });
});
