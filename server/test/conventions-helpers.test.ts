import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  dedupeCandidates,
  renderSample,
  renderSamples,
  ruleKey,
  toCandidateDto,
  toSampledFile,
  verifyCandidate,
  type RawCandidate,
  type SampledFile,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/db/rows.js';

function file(path: string, raw: string): SampledFile {
  return toSampledFile(path, raw);
}

function candidate(partial: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: 'errors',
    rule: 'Always wrap async route handlers in a try/catch.',
    rationale: 'Uncaught rejections crash the process.',
    evidence_path: 'src/api/users.ts',
    evidence_line: 2,
    evidence_snippet: 'export async function handler() {',
    confidence: 0.8,
    ...partial,
  };
}

describe('sample rendering', () => {
  it('renders a file with a 1-based line-number gutter', () => {
    const f = file('src/a.ts', 'const a = 1;\nconst b = 2;');
    expect(renderSample(f)).toBe('--- FILE: src/a.ts ---\n1\tconst a = 1;\n2\tconst b = 2;');
  });

  it('truncates a file beyond the per-file line cap and marks it truncated', () => {
    const raw = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const f = file('big.ts', raw);
    expect(f.truncated).toBe(true);
    expect(f.lines).toHaveLength(220);
    expect(renderSample(f)).toContain('… (truncated)');
  });

  it('renderSamples stops before the char budget, dropping files that would overflow it', () => {
    const files = [file('a.ts', 'x'.repeat(50)), file('b.ts', 'y'.repeat(50)), file('c.ts', 'z'.repeat(50))];
    const rendered = renderSamples(files, 80);
    expect(rendered).toContain('a.ts');
    expect(rendered).not.toContain('b.ts');
    expect(rendered).not.toContain('c.ts');
  });
});

describe('verifyCandidate — the evidence gate', () => {
  const files = new Map<string, SampledFile>([
    [
      'src/api/users.ts',
      file(
        'src/api/users.ts',
        ['import { db } from "../db.js";', '', 'export async function handler() {', '  return db.users.find();', '}'].join(
          '\n',
        ),
      ),
    ],
  ]);

  it('keeps a candidate whose snippet really occurs in the sampled file, re-reading it from the file', () => {
    const result = verifyCandidate(files, candidate());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidate.evidencePath).toBe('src/api/users.ts');
    expect(result.candidate.evidenceLine).toBe(3);
    expect(result.candidate.evidenceSnippet).toContain('export async function handler()');
    expect(result.candidate.category).toBe('errors');
  });

  it('corrects a wrong-but-close line number instead of dropping the candidate', () => {
    const result = verifyCandidate(files, candidate({ evidence_line: 99 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidate.evidenceLine).toBe(3); // the real line, not the model's 99
  });

  it('resolves a cited path via a unique suffix match', () => {
    const result = verifyCandidate(files, candidate({ evidence_path: './users.ts' }));
    expect(result.ok).toBe(true);
  });

  it('drops a candidate citing a file that was never sampled', () => {
    const result = verifyCandidate(files, candidate({ evidence_path: 'src/not-sampled.ts' }));
    expect(result).toEqual({ ok: false, reason: 'unknown_file' });
  });

  it('drops a candidate with an ambiguous suffix match rather than guessing', () => {
    const twoFiles = new Map<string, SampledFile>([
      ['a/users.ts', file('a/users.ts', 'export function h() { return 1; }')],
      ['b/users.ts', file('b/users.ts', 'export function h() { return 2; }')],
    ]);
    const result = verifyCandidate(twoFiles, candidate({ evidence_path: 'users.ts' }));
    expect(result).toEqual({ ok: false, reason: 'unknown_file' });
  });

  it('drops a candidate whose snippet is too short to identify a line', () => {
    const result = verifyCandidate(files, candidate({ evidence_snippet: '}' }));
    expect(result).toEqual({ ok: false, reason: 'snippet_too_short' });
  });

  it('drops a candidate whose snippet is not actually in the cited file (invented evidence)', () => {
    const result = verifyCandidate(
      files,
      candidate({ evidence_snippet: 'this line does not exist anywhere' }),
    );
    expect(result).toEqual({ ok: false, reason: 'snippet_not_found' });
  });

  it('drops a candidate with an empty rule', () => {
    const result = verifyCandidate(files, candidate({ rule: '   ' }));
    expect(result).toEqual({ ok: false, reason: 'empty_rule' });
  });

  it('falls back to "general" when the model returns an unknown category', () => {
    const result = verifyCandidate(files, candidate({ category: 'not-a-real-category' }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidate.category).toBe('general');
  });
});

describe('dedupeCandidates', () => {
  const a = verifyCandidateFixture('First rule', 0.9);
  const b = verifyCandidateFixture('Second rule', 0.8);
  const aAgain = verifyCandidateFixture('first   RULE.', 0.7);

  function verifyCandidateFixture(rule: string, confidence: number) {
    const files = new Map<string, SampledFile>([['f.ts', file('f.ts', 'export const x = 1;')]]);
    const result = verifyCandidate(
      files,
      candidate({ rule, evidence_path: 'f.ts', evidence_snippet: 'export const x = 1;', confidence }),
    );
    if (!result.ok) throw new Error('fixture must verify ok');
    return result.candidate;
  }

  it('drops a candidate that repeats another candidate in the same batch (punctuation/case-insensitive)', () => {
    const { kept, dropped } = dedupeCandidates([a, aAgain, b]);
    expect(kept.map((c) => c.rule)).toEqual(['First rule', 'Second rule']);
    expect(dropped).toBe(1);
  });

  it('drops a candidate that repeats a rule the user already decided on a prior scan', () => {
    const { kept, dropped } = dedupeCandidates([a, b], [ruleKey('First rule')]);
    expect(kept.map((c) => c.rule)).toEqual(['Second rule']);
    expect(dropped).toBe(1);
  });
});

describe('toCandidateDto', () => {
  it('maps a persisted row to the public DTO', () => {
    const row = {
      id: 'c1',
      workspaceId: 'w1',
      repoId: 'r1',
      category: 'naming',
      rule: 'Use camelCase',
      rationale: null,
      evidencePath: 'src/a.ts',
      evidenceLine: 3,
      evidenceSnippet: 'const fooBar = 1;',
      confidence: 0.75,
      status: 'pending',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    } as unknown as ConventionRow;

    expect(toCandidateDto(row)).toEqual({
      id: 'c1',
      repo_id: 'r1',
      category: 'naming',
      rule: 'Use camelCase',
      rationale: null,
      evidence_path: 'src/a.ts',
      evidence_line: 3,
      evidence_snippet: 'const fooBar = 1;',
      confidence: 0.75,
      status: 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('buildSkillDraft', () => {
  it('assembles accepted rows into one markdown body with file:line evidence per rule', () => {
    const rows = [
      {
        id: 'c1',
        rule: 'Always use async/await instead of .then() chains',
        rationale: 'Keeps error handling consistent.',
        evidencePath: 'src/api/users.ts',
        evidenceLine: 23,
        evidenceSnippet: 'const user = await db.users.find(id);',
      },
      {
        id: 'c2',
        rule: 'Redis access goes through src/lib/redis.ts singleton',
        rationale: null,
        evidencePath: 'src/lib/redis.ts',
        evidenceLine: 1,
        evidenceSnippet: 'export const redis = new Redis(config.redisUrl);',
      },
    ] as unknown as ConventionRow[];

    const draft = buildSkillDraft('acme/payments-api', rows);
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.convention_ids).toEqual(['c1', 'c2']);
    expect(draft.evidence_files).toEqual(['src/api/users.ts', 'src/lib/redis.ts']);
    expect(draft.body).toContain('Always use async/await instead of .then() chains');
    expect(draft.body).toContain('src/api/users.ts:23');
    expect(draft.body).toContain('const user = await db.users.find(id);');
  });

  it('names the skill after the last path segment of the repo full name, slugified', () => {
    const draft = buildSkillDraft('some-org/Weird Repo Name', []);
    expect(draft.name).toBe('weird-repo-name-conventions');
  });
});
