import { describe, it, expect } from 'vitest';
import { groundCandidates, normalizeWs, toConventionDto } from '../src/modules/conventions/helpers.js';

const FILES = new Map([
  ['src/a.ts', 'export async function load() {\n  const user = await db.users.find(id);\n  return user;\n}\n'],
  ['tsconfig.json', '{ "compilerOptions": { "strict": true } }'],
]);

const cand = (over: Partial<Parameters<typeof groundCandidates>[0][number]> = {}) => ({
  rule: 'Use async/await',
  evidence_path: 'src/a.ts',
  evidence_snippet: 'const user = await db.users.find(id);',
  confidence: 0.9,
  ...over,
});

describe('groundCandidates (evidence gate)', () => {
  it('keeps a candidate whose file was sampled and snippet is present', () => {
    const { kept, dropped } = groundCandidates([cand()], FILES);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ evidencePath: 'src/a.ts', confidence: 0.9 });
    expect(dropped).toBe(0);
  });

  it('tolerates whitespace/indentation differences in the quoted snippet', () => {
    const { kept } = groundCandidates(
      [cand({ evidence_snippet: 'const   user =\n      await db.users.find(id);' })],
      FILES,
    );
    expect(kept).toHaveLength(1);
  });

  it('drops a candidate citing a file that was not sent', () => {
    const { kept, dropped } = groundCandidates([cand({ evidence_path: 'src/ghost.ts' })], FILES);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('drops a candidate whose snippet is not in the file', () => {
    const { kept, dropped } = groundCandidates(
      [cand({ evidence_snippet: 'await somethingElse()' })],
      FILES,
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('drops empty snippets and empty rules', () => {
    const { kept, dropped } = groundCandidates(
      [cand({ evidence_snippet: '   ' }), cand({ rule: '  ' })],
      FILES,
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(2);
  });

  it('drops a duplicate rule (case/whitespace-insensitive)', () => {
    const { kept, dropped } = groundCandidates(
      [cand(), cand({ rule: '  use ASYNC/await ' })],
      FILES,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(1);
  });
});

describe('helpers', () => {
  it('normalizeWs collapses whitespace', () => {
    expect(normalizeWs('  a \n\t b  ')).toBe('a b');
  });

  it('toConventionDto maps nullable columns to empty strings / 0', () => {
    const dto = toConventionDto({
      id: 'x',
      workspaceId: 'w',
      repoId: 'r',
      rule: 'r',
      evidencePath: null,
      evidenceSnippet: null,
      confidence: null,
      accepted: false,
    });
    expect(dto).toEqual({
      id: 'x',
      rule: 'r',
      evidence_path: '',
      evidence_snippet: '',
      confidence: 0,
      accepted: false,
    });
  });
});
