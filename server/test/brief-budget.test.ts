import { describe, expect, it } from 'vitest';
import { estimateTokens, fitBudget } from '../src/modules/brief/domain/budget.js';
import { buildBriefMessages, measureMessages } from '../src/modules/brief/prompt.js';
import type { BriefFacts } from '../src/modules/brief/domain/types.js';

const hunk = { header: '@@ -1,2 +1,3 @@', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3 };

function facts(over: Partial<BriefFacts> = {}): BriefFacts {
  return {
    pr: { number: 1, fullName: 'o/r', title: 'T', body: 'body' },
    intent: null,
    linkedIssues: [],
    files: [
      { path: 'a.ts', additions: 1, deletions: 0, role: null, hunks: [hunk] },
      { path: 'gen.ts', additions: 1, deletions: 0, role: 'boilerplate', hunks: [hunk] },
    ],
    blast: null,
    specDocs: [],
    ...over,
  };
}
const real = (f: BriefFacts) => measureMessages(buildBriefMessages(f));

describe('estimateTokens', () => {
  it('ceil(len/4)', () => expect(estimateTokens('abcde')).toBe(2));
});

describe('fitBudget', () => {
  it('fits untouched', () => {
    const r = fitBudget(facts(), real, 8000);
    expect(r.ok && r.truncated).toEqual({ spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 });
  });

  it('cuts docs from the end first and stops as soon as it fits', () => {
    const docs = [1, 2, 3].map((i) => ({ path: `d${i}.md`, content: 'x'.repeat(8000) }));
    const callers = [{ symbol: 's', file: 'c.ts', line: 1, name: 'c' }];
    const base = facts({
      specDocs: docs,
      blast: { summary: 's', changedSymbols: [], callers, endpoints: [], crons: [] },
    });
    const limit = real({ ...base, specDocs: docs.slice(0, 1) });
    const r = fitBudget(base, real, limit);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncated.spec_docs).toBe(2);
      expect(r.truncated.callers).toBe(0);
      expect(r.facts.specDocs.map((d) => d.path)).toEqual(['d1.md']);
    }
  });

  it('cuts callers after docs, then boilerplate hunks only', () => {
    const callers = Array.from({ length: 50 }, (_, i) => ({ symbol: 's', file: `c${i}.ts`, line: i + 1, name: 'n' }));
    const base = facts({ blast: { summary: 's', changedSymbols: [], callers, endpoints: [], crons: [] } });
    const noCallers = real({ ...base, blast: { ...base.blast!, callers: [] } });
    const noHunks = real({
      ...base,
      blast: { ...base.blast!, callers: [] },
      files: base.files.map((f) => (f.role === 'boilerplate' ? { ...f, hunks: [] } : f)),
    });
    const r = fitBudget(base, real, noCallers - 1);
    expect(noHunks).toBeLessThan(noCallers);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncated.callers).toBe(50);
      expect(r.truncated.boilerplate_hunk_files).toBe(1);
      expect(r.facts.files[0]?.hunks).toHaveLength(1); // role null keeps hunks
    }
  });

  it('too large: ok=false, mandatory parts untouched', () => {
    const r = fitBudget(facts({ pr: { number: 1, fullName: 'o/r', title: 'T', body: 'x'.repeat(40_000) } }), real, 8000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.tokens).toBeGreaterThan(8000);
  });
});
