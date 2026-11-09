import { describe, expect, it } from 'vitest';
import {
  blastFacts,
  blastMapFiles,
  intentFacts,
  linkedIssueRefs,
  missingInputs,
} from '../src/modules/brief/domain/inputs.js';
import type { BriefBlastView, BriefIntentView } from '../src/modules/brief/domain/types.js';

const okIntent: BriefIntentView = {
  status: 'ok',
  intent: 'Add retries',
  in_scope: ['a'],
  out_of_scope: ['b'],
  sources: [
    { kind: 'issue', ref: '#1', status: 'read' },
    { kind: 'issue', ref: '#1', status: 'read' },
    { kind: 'issue', ref: '#2', status: 'unreadable' },
    { kind: 'doc', ref: 'specs/x.md', status: 'read' },
  ],
};

const blast: BriefBlastView = {
  degraded: false,
  reason: null,
  link_sha: 'abc',
  summary: 's',
  changed_symbols: [{ name: 'pay', file: 'src/pay.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'pay',
      callers: [{ name: 'checkout', file: 'src/checkout.ts', line: 9 }],
      endpoints_affected: ['POST /z', 'GET /a'],
      crons_affected: [],
    },
  ],
};

describe('missingInputs', () => {
  it('intent null + blast degraded', () => {
    const b: BriefBlastView = { ...blast, degraded: true, reason: 'index_failed' };
    expect(missingInputs({ intent: null, blast: b })).toEqual([
      { input: 'intent', reason: 'not_derived' },
      { input: 'blast', reason: 'index_failed' },
      { input: 'smart_diff_roles', reason: 'not_in_build' },
    ]);
  });
  it('failed intent', () => {
    const i: BriefIntentView = { ...okIntent, status: 'failed', intent: null };
    expect(missingInputs({ intent: i, blast })[0]).toEqual({ input: 'intent', reason: 'failed' });
  });
  it('all available -> only roles', () => {
    expect(missingInputs({ intent: okIntent, blast })).toEqual([
      { input: 'smart_diff_roles', reason: 'not_in_build' },
    ]);
  });
  it('blast null -> no_data', () => {
    expect(missingInputs({ intent: okIntent, blast: null })[0]).toEqual({ input: 'blast', reason: 'no_data' });
  });
});

describe('facts', () => {
  it('intentFacts / linkedIssueRefs', () => {
    expect(intentFacts(okIntent)).toEqual({ intent: 'Add retries', in_scope: ['a'], out_of_scope: ['b'] });
    expect(intentFacts({ ...okIntent, intent: null })).toBeNull();
    expect(linkedIssueRefs(okIntent)).toEqual(['#1']);
    expect(linkedIssueRefs(null)).toEqual([]);
  });
  it('blastFacts flattens callers, sorts endpoints', () => {
    const f = blastFacts(blast);
    expect(f?.callers).toEqual([{ symbol: 'pay', file: 'src/checkout.ts', line: 9, name: 'checkout' }]);
    expect(f?.endpoints).toEqual(['GET /a', 'POST /z']);
    expect(blastFacts({ ...blast, degraded: true, reason: 'flag_off' })).toBeNull();
  });
  it('blastMapFiles', () => {
    expect([...(blastMapFiles(blast) ?? [])].sort()).toEqual(['src/checkout.ts', 'src/pay.ts']);
    expect(blastMapFiles({ ...blast, degraded: true, reason: 'no_data' })).toBeNull();
  });
});
