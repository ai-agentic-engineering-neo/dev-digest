import { describe, it, expect } from 'vitest';
import { shapeAgents, shapeFindings, shapeConventions } from '../src/format.js';
import { finding, runFindings } from './helpers.js';
import type { Agent, ConventionsView, RunFindings } from '@devdigest/shared';

const data = (fs: unknown[]) => runFindings('done', fs) as unknown as RunFindings;

describe('shapeFindings', () => {
  const fs = [finding('a', 'SUGGESTION'), finding('b', 'CRITICAL'), finding('c', 'WARNING')];
  it('concise: sorted by severity, no rationale', () => {
    const out = shapeFindings(data(fs), { format: 'concise', minSeverity: 'SUGGESTION' });
    expect(out.findings.map((f: any) => f.title)).toEqual(['T-b', 'T-c', 'T-a']);
    expect(JSON.stringify(out)).not.toContain('RATIONALE');
    expect(out.counts).toEqual({ critical: 1, warning: 1, suggestion: 1 });
    expect(out.verdict).toBe('request_changes');
  });
  it('detailed adds rationale and suggestion', () => {
    const out = shapeFindings(data(fs), { format: 'detailed', minSeverity: 'SUGGESTION' });
    expect(JSON.stringify(out)).toContain('RATIONALE-b');
    expect(JSON.stringify(out)).toContain('SUGGEST-b');
  });
  it('min_severity filters and counts omitted', () => {
    const out = shapeFindings(data(fs), { format: 'concise', minSeverity: 'WARNING' });
    expect(out.findings).toHaveLength(2);
    expect(out.omitted).toBe(1);
  });
  it('caps concise at 15 with omitted', () => {
    const many = Array.from({ length: 20 }, (_, i) => finding(`f${i}`, 'WARNING'));
    const out = shapeFindings(data(many), { format: 'concise', minSeverity: 'SUGGESTION' });
    expect(out.findings).toHaveLength(15);
    expect(out.omitted).toBe(5);
  });
  it('truncates beyond the text cap', () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ ...finding(`f${i}`, 'WARNING'), title: 'x'.repeat(2000) }));
    const out = shapeFindings(data(big), { format: 'detailed', minSeverity: 'SUGGESTION' });
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(40_000);
    expect((out as any).truncated).toBe(true);
  });
});

describe('shapeFindings detailed caps', () => {
  it('returns at most 50 findings and clips rationale to 800 chars', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...finding(`f${i}`, 'WARNING'), rationale: 'r'.repeat(5000) }));
    const out = shapeFindings(data(many), { format: 'detailed', minSeverity: 'SUGGESTION' });
    expect(out.findings.length).toBeLessThanOrEqual(50);
    expect(out.findings.length).toBeGreaterThan(0);
    for (const f of out.findings as { rationale: string }[]) expect(f.rationale.length).toBeLessThanOrEqual(800);
  });
});

describe('shapeAgents', () => {
  const agents = [
    { id: '1', name: 'A', description: 'd', provider: 'openai', model: 'm', system_prompt: 'SECRET PROMPT', enabled: true, strategy: 'single-pass', skill_count: 1, stats: { runs: 3 } },
    { id: '2', name: 'B', description: 'd', provider: 'openai', model: 'm', system_prompt: 'SECRET PROMPT', enabled: false, strategy: 'single-pass', skill_count: 0, stats: { runs: 0 } },
  ] as unknown as Agent[];
  it('hides disabled by default and never leaks the prompt', () => {
    const out = shapeAgents(agents, false);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(shapeAgents(agents, true))).not.toContain('SECRET');
    expect(shapeAgents(agents, true)).toHaveLength(2);
    expect(out[0]!.runs).toBe(3);
  });
});

describe('shapeConventions', () => {
  const cand = (status: string, rule: string) => ({ id: rule, repo_id: 'r', scan_id: null, category: 'naming', rule, evidence_path: 'a.ts', evidence_line: 3, evidence_snippet: 'SNIPPET', confidence: 0.8, status, updated_at: '' });
  const view = { scan: null, candidates: [cand('accepted', 'r1'), cand('candidate', 'r2')] } as unknown as ConventionsView;
  it('defaults to accepted, evidence as path:line, no snippets', () => {
    const out = shapeConventions('acme/x', view, 'accepted') as any;
    expect(out.rules).toEqual([{ category: 'naming', rule: 'r1', evidence: 'a.ts:3', confidence: 0.8 }]);
    expect(JSON.stringify(out)).not.toContain('SNIPPET');
    expect(out.counts_by_status).toEqual({ accepted: 1, candidate: 1 });
  });
  it('all returns every rule; empty accepted adds a note', () => {
    expect((shapeConventions('x', view, 'all') as any).rules).toHaveLength(2);
    const empty = shapeConventions('x', { scan: null, candidates: [] } as unknown as ConventionsView, 'accepted') as any;
    expect(empty.note).toContain('Conventions page');
  });
});
