import { describe, it, expect } from 'vitest';
import {
  buildFallbackTrace,
  buildTrace,
  rankNote,
  renderCallersDigest,
} from './run-trace-rules.js';

describe('renderCallersDigest', () => {
  it('returns undefined for no rows', () => {
    expect(renderCallersDigest([])).toBeUndefined();
  });

  it('groups by file in first-appearance order', () => {
    expect(
      renderCallersDigest([
        { file: 'a.ts', symbol: 'f', signature: 'f(x: number): void' },
        { file: 'b.ts', symbol: 'g', signature: 'g(): string' },
        { file: 'a.ts', symbol: 'h', signature: 'h(): void' },
      ]),
    ).toBe('### a.ts\n- `f` — f(x: number): void\n- `h` — h(): void\n### b.ts\n- `g` — g(): string');
  });
});

describe('rankNote', () => {
  it('is empty when nothing is hot (94 is below the threshold)', () => {
    expect(rankNote([{ percentile: 94 }, { percentile: 10 }], 2)).toEqual({ note: '', hotCount: 0 });
    expect(rankNote([], 2)).toEqual({ note: '', hotCount: 0 });
  });

  it('counts files at >= 95 and words the note verbatim', () => {
    expect(rankNote([{ percentile: 95 }, { percentile: 99 }, { percentile: 50 }], 3)).toEqual({
      hotCount: 2,
      note: '\n\n2 of 3 changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.',
    });
  });
});

const AGENT = { name: 'Sec', version: 3, provider: 'openai', model: 'gpt-4.1' };

describe('buildTrace', () => {
  it('assembles the success-path RunTrace', () => {
    const assembly = {
      system: 's',
      skills: null,
      memory: null,
      specs: null,
      intent: null,
      intent_scope: null,
      user: 'u',
    };
    const trace = buildTrace({
      agent: AGENT,
      prNumber: 7,
      durationMs: 100,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.01,
      findingsCount: 2,
      grounding: '2/2 passed',
      assembly,
      chunks: [{ label: 'a.ts' }, { label: 'b.ts' }, { label: 'c.ts' }],
      mode: 'single-pass',
      raw: { verdict: 'approve', summary: 'ok', score: 90, findings: [] } as never,
      specsRead: [],
      log: [{ t: '00:00:00', kind: 'info', msg: 'x' }] as never,
    });
    expect(trace.config).toEqual({
      agent: 'Sec',
      version: '3',
      provider: 'openai',
      model: 'gpt-4.1',
      pr: 7,
      source: 'local',
    });
    expect(trace.stats).toEqual({
      duration_ms: 100,
      tokens_in: 10,
      tokens_out: 5,
      cost_usd: 0.01,
      findings: 2,
      grounding: '2/2 passed',
    });
    expect(trace.prompt_assembly).toBe(assembly);
    expect(trace.tool_calls).toEqual([
      { tool: 'review_file', args: 'a.ts', meta: 'single-pass', ms: 33 },
      { tool: 'review_file', args: 'b.ts', meta: 'single-pass', ms: 33 },
      { tool: 'review_file', args: 'c.ts', meta: 'single-pass', ms: 33 },
    ]);
    expect(trace.memory_pulled).toEqual([]);
  });

  it('does not divide by zero with no chunks', () => {
    const trace = buildTrace({
      agent: AGENT,
      prNumber: 1,
      durationMs: 50,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      findingsCount: 0,
      grounding: '0/0 passed',
      assembly: {} as never,
      chunks: [],
      mode: 'm',
      raw: '' as never,
      specsRead: [],
      log: [],
    });
    expect(trace.tool_calls).toEqual([]);
  });
});

describe('buildFallbackTrace', () => {
  it('emits the minimal failure trace with the given log', () => {
    const log = [{ t: '03:04:05', kind: 'error', msg: 'boom' }] as never;
    expect(
      buildFallbackTrace({
        agent: { ...AGENT, systemPrompt: 'sys' },
        prNumber: 9,
        grounding: '0/0 passed',
        durationMs: 12,
        log,
      }),
    ).toEqual({
      config: { agent: 'Sec', version: '3', provider: 'openai', model: 'gpt-4.1', pr: 9, source: 'local' },
      stats: { duration_ms: 12, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: {
        system: 'sys',
        skills: null,
        memory: null,
        specs: null,
        intent: null,
        intent_scope: null,
        user: '',
      },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log,
    });
  });
});
