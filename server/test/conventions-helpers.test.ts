/** conventions — pure helper tests (hermetic). */
import { describe, expect, it } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import {
  buildExtractionMessages,
  buildSkillDraft,
  configCandidates,
  headingSlug,
  ruleKey,
  sampleDirs,
  truncateSample,
  verifyEvidence,
} from '../src/modules/conventions/helpers.js';

const cand = (over: Partial<Parameters<typeof verifyEvidence>[0]> = {}) => ({
  category: 'async' as const,
  rule: 'Always use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  evidence_line: 3,
  evidence_snippet: 'const user = await db.users.find(id);',
  confidence: 0.9,
  ...over,
});
const files = new Map([
  ['src/api/users.ts', 'import { db } from "../db";\n\nexport async function get(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}\n'],
]);

describe('sample selection', () => {
  it('derives config candidates for the root and each sampled top-level folder', () => {
    const dirs = sampleDirs(['server/src/a.ts', 'client/src/b.tsx', 'README.md', 'server/src/c.ts']);
    expect(dirs).toEqual(['', 'server/', 'client/']);
    const cfg = configCandidates(['server/src/a.ts']);
    expect(cfg).toContain('tsconfig.json');
    expect(cfg).toContain('server/eslint.config.mjs');
    expect(cfg).toContain('server/.prettierrc');
  });
  it('truncates a sample on a line boundary with a marker', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const cut = truncateSample(text, 40);
    expect(cut.length).toBeLessThan(60);
    expect(cut.endsWith('… (truncated)')).toBe(true);
    expect(truncateSample('short', 40)).toBe('short');
  });
});

describe('verifyEvidence', () => {
  it('keeps a candidate whose snippet is on the claimed line, or within the window (line corrected)', () => {
    expect(verifyEvidence(cand({ evidence_line: 4 }), files)?.evidence_line).toBe(4);
    const shifted = verifyEvidence(cand({ evidence_line: 3 }), files);
    expect(shifted?.evidence_line).toBe(4);
    expect(shifted?.evidence_snippet).toBe('  const user = await db.users.find(id);');
  });
  it('drops a candidate whose file was not sampled, whose line is out of range, or whose text is not there', () => {
    expect(verifyEvidence(cand({ evidence_path: 'src/other.ts' }), files)).toBeUndefined();
    expect(verifyEvidence(cand({ evidence_line: 99 }), files)).toBeUndefined();
    expect(verifyEvidence(cand({ evidence_snippet: 'redis.connect()' }), files)).toBeUndefined();
    expect(verifyEvidence(cand({ evidence_snippet: '   ' }), files)).toBeUndefined();
  });
});

describe('prompt and draft', () => {
  it('wraps every sample as untrusted data and names the repo', () => {
    const msgs = buildExtractionMessages('acme/payments-api', [{ path: 'src/a.ts', content: 'x' }]);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.content).toContain('<untrusted source="src/a.ts">');
    expect(msgs[1]!.content).toContain('acme/payments-api');
  });
  it('rule keys and heading slugs are stable across punctuation and case', () => {
    expect(ruleKey('Always use async/await instead of .then() chains')).toBe(ruleKey('always use ASYNC AWAIT instead of then chains'));
    expect(headingSlug('Always use async/await instead of .then() chains')).toBe('async-await-instead-then-chains');
  });
  it('builds the repo-conventions skill from the accepted candidates only', () => {
    const c = (rule: string, status: ConventionCandidate['status']): ConventionCandidate => ({
      id: rule, repo_id: 'r', scan_id: null, category: 'async', rule, evidence_path: 'src/a.ts', evidence_line: 2,
      evidence_snippet: 'await x()', confidence: 0.8, status, updated_at: '2026-09-26T00:00:00.000Z',
    });
    const draft = buildSkillDraft('acme/payments-api', [c('Always await promises', 'accepted')]);
    expect(draft.name).toBe('repo-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.description).toContain('1 house convention extracted from payments-api');
    expect(draft.body).toContain('# repo-conventions');
    expect(draft.body).toContain('## await-promises');
    expect(draft.body).toContain('Detected in `src/a.ts:2`');
  });
});
