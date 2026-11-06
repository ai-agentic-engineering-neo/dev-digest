import { describe, it, expect } from 'vitest';
import { assessBody, deriveConfidence, staleness } from '../src/modules/intent/domain/confidence.js';
import {
  canonicalIntentInput,
  formatIntentSkipped,
  formatIntentStep,
  renderIntentBlock,
  sanitizeClassification,
  toPrIntentDto,
} from '../src/modules/intent/domain/render.js';
import type { IntentRecord, IntentSource } from '../src/modules/intent/domain/types.js';

const src = (over: Partial<IntentSource>): IntentSource => ({
  id: 'x',
  kind: 'title',
  ref: 'x',
  weight: 'strong',
  status: 'read',
  reason: null,
  used: true,
  cited: false,
  issue_number: null,
  path: null,
  ...over,
});

const record = (over: Partial<IntentRecord> = {}): IntentRecord => ({
  prId: '11111111-1111-1111-1111-111111111111',
  status: 'ok',
  derived: { intent: 'Add login rate limiting', inScope: ['login route'], outOfScope: ['signup'] },
  kind: 'feature',
  confidence: 'high',
  confidenceReason: 'substantive_body',
  confidenceLowered: false,
  sources: [src({ id: 'pr_body', kind: 'pr_body', ref: 'PR body' })],
  headSha: 'aaa',
  inputHash: 'h',
  bodyHash: 'b',
  usage: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', tokensIn: 812, tokensOut: 143, costUsd: 0.0002 },
  error: null,
  override: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('assessBody', () => {
  it('classifies empty, short and substantive', () => {
    expect(assessBody(null)).toEqual({ quality: 'empty', templateOnly: false });
    expect(assessBody('Fixes the crash on login.').quality).toBe('short');
    expect(assessBody('x'.repeat(130)).quality).toBe('substantive');
  });
  it('flags a template-only body', () => {
    const body = '## Summary\n\n<!-- describe here -->\n- [ ] tests\n- [x] docs\n---\nCloses #5';
    expect(assessBody(body)).toEqual({ quality: 'empty', templateOnly: true });
  });
});

describe('deriveConfidence', () => {
  it('follows the rule order', () => {
    expect(deriveConfidence({ body: 'substantive', sources: [], sourcesConflict: false })).toEqual({ confidence: 'high', reason: 'substantive_body', lowered: false });
    expect(deriveConfidence({ body: 'short', sources: [src({ kind: 'plan' })], sourcesConflict: false }).reason).toBe('linked_doc');
    expect(deriveConfidence({ body: 'empty', sources: [src({ kind: 'issue' })], sourcesConflict: false })).toMatchObject({ confidence: 'medium', reason: 'closing_issue' });
    expect(deriveConfidence({ body: 'short', sources: [], sourcesConflict: false })).toMatchObject({ confidence: 'medium', reason: 'short_body' });
    expect(deriveConfidence({ body: 'empty', sources: [src({})], sourcesConflict: false })).toMatchObject({ confidence: 'low', reason: 'indirect_only' });
  });
  it('never lets a weak issue or an unread doc raise confidence', () => {
    const weak = src({ kind: 'issue', weight: 'weak' });
    const unread = src({ kind: 'doc', status: 'unavailable' });
    expect(deriveConfidence({ body: 'empty', sources: [weak, unread], sourcesConflict: false }).confidence).toBe('low');
  });
  it('lowers on conflict but never raises low', () => {
    expect(deriveConfidence({ body: 'substantive', sources: [], sourcesConflict: true })).toMatchObject({ confidence: 'medium', lowered: true });
    expect(deriveConfidence({ body: 'short', sources: [], sourcesConflict: true })).toMatchObject({ confidence: 'low', lowered: true });
    expect(deriveConfidence({ body: 'empty', sources: [], sourcesConflict: true })).toMatchObject({ confidence: 'low', lowered: false });
  });
});

describe('staleness', () => {
  it('checks head first, then body', () => {
    expect(staleness({ headSha: 'a', bodyHash: 'x' }, { headSha: 'b', bodyHash: 'y' })).toBe('head_moved');
    expect(staleness({ headSha: 'a', bodyHash: 'x' }, { headSha: 'a', bodyHash: 'y' })).toBe('body_changed');
    expect(staleness({ headSha: 'a', bodyHash: 'x' }, { headSha: 'a', bodyHash: 'x' })).toBeNull();
  });
});

describe('sanitizeClassification', () => {
  it('clamps text, lists and kind and drops unknown relied_on ids', () => {
    const out = sanitizeClassification(
      {
        intent: `  ${'word '.repeat(200)} `,
        in_scope: ['A', 'a', '  ', 'b'.repeat(500), ...Array.from({ length: 20 }, (_, i) => `item ${i}`)],
        out_of_scope: [],
        kind: 'Wizardry',
        relied_on: ['pr_body', 'evil', 'pr_body'],
        sources_conflict: true,
      },
      ['pr_body', 'title'],
    );
    expect(out.derived.intent.length).toBeLessThanOrEqual(400);
    expect(out.derived.intent.endsWith('…')).toBe(true);
    expect(out.derived.inScope).toHaveLength(8);
    expect(out.derived.inScope.filter((s) => s.toLowerCase() === 'a')).toHaveLength(1);
    expect(out.derived.inScope.every((s) => s.length <= 160)).toBe(true);
    expect(out.kind).toBe('unknown');
    expect(out.citedIds).toEqual(['pr_body']);
    expect(out.sourcesConflict).toBe(true);
  });
  it('keeps a valid kind', () => {
    expect(sanitizeClassification({ intent: 'x', in_scope: [], out_of_scope: [], kind: 'Fix', relied_on: [], sources_conflict: false }, []).kind).toBe('fix');
  });
});

describe('canonicalIntentInput', () => {
  it('changes with model and text', () => {
    const bundle = { sources: [src({ id: 'a' })], offered: [{ id: 'a', label: 'a', text: 't' }], bodyQuality: 'short' as const };
    const m = { provider: 'p', model: 'm' };
    expect(canonicalIntentInput(bundle, m)).toBe(canonicalIntentInput(bundle, m));
    expect(canonicalIntentInput(bundle, m)).not.toBe(canonicalIntentInput(bundle, { provider: 'p', model: 'n' }));
    expect(canonicalIntentInput({ ...bundle, offered: [{ id: 'a', label: 'a', text: 'u' }] }, m)).not.toBe(canonicalIntentInput(bundle, m));
  });
});

describe('toPrIntentDto', () => {
  const cur = { headSha: 'aaa', bodyHash: 'b' };
  it('maps a derived record', () => {
    const dto = toPrIntentDto(record(), cur);
    expect(dto).toMatchObject({ origin: 'derived', intent: 'Add login rate limiting', stale: false, tokens_in: 812, head_sha: 'aaa' });
    expect(dto.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });
  it('reports a user override as stale on a new head', () => {
    const r = record({ override: { intent: 'Mine', inScope: [], outOfScope: [], headSha: 'old', at: new Date() } });
    expect(toPrIntentDto(r, cur)).toMatchObject({ origin: 'user', intent: 'Mine', stale: true, stale_reason: 'head_moved', head_sha: 'old' });
  });
  it('maps a failed record without text', () => {
    const r = record({ status: 'failed', derived: null, error: 'boom', usage: null });
    expect(toPrIntentDto(r, cur)).toMatchObject({ status: 'failed', intent: null, error: 'boom', stale: false, cost_usd: null });
  });
});

describe('renderIntentBlock', () => {
  const cur = { headSha: 'aaa' };
  it('states low confidence for indirect-only', () => {
    const block = renderIntentBlock(record({ confidence: 'low', confidenceReason: 'indirect_only' }), cur);
    expect(block).toContain('Confidence: low');
    expect(block).toContain('indirect signals');
    expect(block).toContain('Intent: Add login rate limiting');
    expect(block).toContain('Sources: PR body');
  });
  it('stays within the budget by dropping trailing bullets', () => {
    const many = Array.from({ length: 8 }, (_, i) => `${i} ${'z'.repeat(150)}`);
    const block = renderIntentBlock(record({ derived: { intent: 'x'.repeat(400), inScope: many, outOfScope: many } }), cur);
    expect(block).not.toBeNull();
    expect(block!.length).toBeLessThanOrEqual(1800);
    expect(block).toContain('Intent: ');
  });
  it('is null without effective text', () => {
    expect(renderIntentBlock(record({ status: 'failed', derived: null }), cur)).toBeNull();
  });
  it('prefers the user override', () => {
    const block = renderIntentBlock(record({ override: { intent: 'Mine', inScope: [], outOfScope: [], headSha: 'aaa', at: new Date() } }), cur);
    expect(block).toContain('Origin: edited by the user');
    expect(block).toContain('Intent: Mine');
    expect(block).not.toContain('In scope:');
  });
});

describe('log lines', () => {
  const base = { origin: 'derived' as const, confidence: 'high' as const, stale: false, sourceRefs: ['PR body', 'issue #12', 'plans/foo.md'], provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', tokensIn: 812, tokensOut: 143, costUsd: 0.0002 };
  it('formats a miss exactly', () => {
    expect(formatIntentStep({ ...base, cache: 'miss' })).toBe(
      'Intent ready (cache miss) — confidence high · sources: PR body, issue #12, plans/foo.md · model openrouter/deepseek/deepseek-v4-flash · 812→143 tok · cost $0.0002',
    );
  });
  it('formats hit, override and unknown cost', () => {
    expect(formatIntentStep({ ...base, cache: 'hit', tokensIn: 0, tokensOut: 0 })).toContain('0→0 tok · cost $0.0000 (computed earlier)');
    expect(formatIntentStep({ ...base, cache: 'override', stale: true })).toBe('Intent ready (cache override) — edited by user · stale');
    expect(formatIntentStep({ ...base, cache: 'miss', costUsd: null })).toContain('cost n/a');
  });
  it('formats a skip', () => {
    expect(formatIntentSkipped('no key')).toBe('Intent unavailable — reviewing without it (warning): no key');
  });
});
