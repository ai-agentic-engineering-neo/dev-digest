import { afterEach, describe, expect, it } from 'vitest';
import { MAX_FINDINGS } from '../src/format.js';
import { MAX_CONVENTIONS, MAX_RULE_CHARS } from '../src/tools/get-conventions.js';
import { connect, finding, freshState, PR_ID, SECURITY, text, type FakeState } from './helpers/harness.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup(state: FakeState = freshState(), config = {}) {
  const c = await connect(state, config);
  close = c.close;
  return { ...c, state };
}

const RUN_ARGS = { repo: 'acme/payments-api', pr: 3, agent: 'Security Reviewer' };

describe('tools/list', () => {
  it('exposes exactly the 5 tools with the expected annotations', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const name of ['list_agents', 'get_findings', 'get_conventions', 'get_blast_radius']) {
      expect(byName[name]!.annotations?.readOnlyHint).toBe(true);
    }
    expect(byName.run_agent_on_pr!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    for (const t of tools) {
      expect(t.outputSchema).toBeDefined();
      for (const prop of Object.values((t.inputSchema.properties ?? {}) as Record<string, { description?: string; type?: string }>)) {
        expect(prop.description, `${t.name} field without .describe()`).toBeTruthy();
        expect(prop.type).not.toBe('object'); // flat arguments only
      }
    }
  });
});

describe('list_agents', () => {
  it('returns id, name, role, enabled only (no system prompt)', async () => {
    const { call } = await setup();
    const r = await call('list_agents');
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      agents: [
        { id: 'agent-sec', name: 'Security Reviewer', role: SECURITY.description, enabled: true },
        { id: 'agent-style', name: 'Style Reviewer', role: 'Naming and style.', enabled: false },
      ],
    });
  });
});

describe('run_agent_on_pr', () => {
  it('happy path: starts, waits for done and returns findings sorted by severity', async () => {
    const state = freshState();
    state.newRunFindings = [finding('SUGGESTION', 1), finding('CRITICAL', 2), finding('WARNING', 3)];
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      status: 'done',
      run_id: 'run-new',
      repo: 'acme/payments-api',
      pr: 3,
      agent: 'Security Reviewer',
      verdict: 'request_changes',
      counts: { critical: 1, warning: 1, suggestion: 1 },
      truncated: 0,
    });
    const sc = r.structuredContent as { findings: { severity: string; file: string; line: number }[] };
    expect(sc.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    expect(sc.findings[0]).toMatchObject({ file: 'src/f2.ts', line: 12 });
    expect(state.calls).toContain(`POST /pulls/${PR_ID}/review`);
    expect(text(r)).toContain('1 CRITICAL, 1 WARNING, 1 SUGGESTION');
  });

  it('resolves the agent by name case-insensitively and by id', async () => {
    const { call } = await setup();
    const byName = await call('run_agent_on_pr', { ...RUN_ARGS, agent: 'security reviewer' });
    expect(byName.isError).toBeFalsy();
    const { call: call2 } = await setup();
    const byId = await call2('run_agent_on_pr', { ...RUN_ARGS, agent: 'agent-sec' });
    expect(byId.isError).toBeFalsy();
  });

  it('unknown agent → isError pointing to list_agents, no run started', async () => {
    const { call, state } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, agent: 'Perf Wizard' });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Agent "Perf Wizard" not found. Call list_agents to see available agents.');
    expect(state.calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('unknown PR → isError suggesting gh pr list', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, pr: 999 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('PR #999 not found in acme/payments-api');
    expect(text(r)).toContain('gh pr list -R acme/payments-api');
  });

  it('repo not imported → isError listing imported repos', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, repo: 'acme/unknown' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Imported: acme/payments-api, lindigo/dev-digest');
  });

  it('invalid repo format → isError from input validation (not a protocol error)', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, repo: 'payments-api' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('owner/name');
  });

  it('run timeout → status running + run_id + hint to call get_findings (not an error)', async () => {
    const state = freshState();
    state.runStatusSequence = ['running'];
    const { call } = await setup(state, { runTimeoutMs: 30, pollMs: 5 });
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ status: 'running', run_id: 'run-new', findings: [] });
    expect((r.structuredContent as { next_step: string }).next_step).toContain('get_findings');
    expect((r.structuredContent as { next_step: string }).next_step).toContain('run-new');
  });

  it('empty findings → approve, zero counts, "No findings."', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      status: 'done',
      verdict: 'approve',
      counts: { critical: 0, warning: 0, suggestion: 0 },
      findings: [],
      truncated: 0,
    });
    expect(text(r)).toContain('No findings.');
  });

  it('failed run → isError with the run error and a next step', async () => {
    const state = freshState();
    state.runStatusSequence = ['failed'];
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('OpenRouter 402');
    expect(text(r)).toContain('retry run_agent_on_pr');
  });

  it('disabled agent → still runs, with a warning field', async () => {
    const { call, state } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, agent: 'Style Reviewer' });
    expect(r.isError).toBeFalsy();
    expect(state.calls).toContain(`POST /pulls/${PR_ID}/review`);
    expect((r.structuredContent as { warning?: string }).warning).toContain('disabled');
  });

  it('429 from DevDigest → isError with retry time', async () => {
    const state = freshState();
    state.reviewStatus = 429;
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('DevDigest rate limit reached (10 reviews/min). Retry in 42 s.');
  });

  it('API down → platform-neutral hint (start the API / DEVDIGEST_API_URL)', async () => {
    const state = freshState();
    state.unreachable = true;
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('DevDigest API is unreachable at http://devdigest.test');
    expect(text(r)).toContain('DEVDIGEST_API_URL');
    expect(text(r)).not.toContain('.sh');
  });
});

describe('truncation and counts', () => {
  it('counts every active finding, caps the list and never drops a CRITICAL', async () => {
    const state = freshState();
    const criticals = Array.from({ length: MAX_FINDINGS + 2 }, (_, i) => finding('CRITICAL', i));
    const suggestions = Array.from({ length: 5 }, (_, i) => finding('SUGGESTION', 100 + i));
    // suggestions first, so a naive slice would keep them and drop criticals
    state.newRunFindings = [...suggestions, ...criticals, finding('WARNING', 200, { dismissed_at: '2026-11-01T00:00:00Z' })];
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    const sc = r.structuredContent as {
      counts: Record<string, number>;
      findings: { severity: string }[];
      truncated: number;
    };
    expect(sc.counts).toEqual({ critical: MAX_FINDINGS + 2, warning: 0, suggestion: 5 }); // dismissed excluded
    expect(sc.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(MAX_FINDINGS + 2);
    expect(sc.findings.some((f) => f.severity === 'SUGGESTION')).toBe(false);
    expect(sc.truncated).toBe(5);
  });

  it('caps a long list at MAX_FINDINGS and reports truncated', async () => {
    const state = freshState();
    state.newRunFindings = [finding('CRITICAL', 0), ...Array.from({ length: 40 }, (_, i) => finding('SUGGESTION', i + 1))];
    const { call } = await setup(state);
    const sc = (await call('run_agent_on_pr', RUN_ARGS)).structuredContent as {
      counts: Record<string, number>;
      findings: { severity: string }[];
      truncated: number;
    };
    expect(sc.findings).toHaveLength(MAX_FINDINGS);
    expect(sc.findings[0]!.severity).toBe('CRITICAL');
    expect(sc.counts).toEqual({ critical: 1, warning: 0, suggestion: 40 });
    expect(sc.truncated).toBe(41 - MAX_FINDINGS);
  });
});

describe('get_findings', () => {
  function withHistory(): FakeState {
    const state = freshState();
    state.runs = [
      { run_id: 'run-style', agent_id: 'agent-style', agent_name: 'Style Reviewer', status: 'done', error: null, ran_at: '2026-11-07T10:00:00Z' },
      { run_id: 'run-sec', agent_id: 'agent-sec', agent_name: 'Security Reviewer', status: 'done', error: null, ran_at: '2026-11-07T09:00:00Z' },
    ];
    state.reviews = [
      { run_id: 'run-style', agent_id: 'agent-style', agent_name: 'Style Reviewer', kind: 'review', verdict: 'comment', summary: 's', score: 80, findings: [finding('SUGGESTION', 1)] },
      { run_id: 'run-sec', agent_id: 'agent-sec', agent_name: 'Security Reviewer', kind: 'review', verdict: 'request_changes', summary: 's', score: 20, findings: [finding('CRITICAL', 1)] },
    ];
    return state;
  }

  it('by run_id', async () => {
    const { call } = await setup(withHistory());
    const r = await call('get_findings', { repo: 'acme/payments-api', pr: 3, run_id: 'run-sec' });
    expect(r.structuredContent).toMatchObject({ status: 'done', run_id: 'run-sec', counts: { critical: 1 } });
  });

  it('without run_id → latest finished run; with agent → latest of that agent', async () => {
    const { call } = await setup(withHistory());
    const latest = await call('get_findings', { repo: 'acme/payments-api', pr: 3 });
    expect(latest.structuredContent).toMatchObject({ run_id: 'run-style' });
    const sec = await call('get_findings', { repo: 'acme/payments-api', pr: 3, agent: 'SECURITY REVIEWER' });
    expect(sec.structuredContent).toMatchObject({ run_id: 'run-sec', agent: 'Security Reviewer', verdict: 'request_changes' });
  });

  it('unknown run_id → isError suggesting to omit it', async () => {
    const { call } = await setup(withHistory());
    const r = await call('get_findings', { repo: 'acme/payments-api', pr: 3, run_id: 'nope' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Omit run_id');
  });

  it('still-running run → status running with next_step', async () => {
    const state = withHistory();
    state.runs.unshift({ run_id: 'run-live', agent_id: 'agent-sec', agent_name: 'Security Reviewer', status: 'running', error: null, ran_at: null });
    const { call } = await setup(state);
    const r = await call('get_findings', { repo: 'acme/payments-api', pr: 3, run_id: 'run-live' });
    expect(r.structuredContent).toMatchObject({ status: 'running', run_id: 'run-live' });
  });

  it('no runs at all → isError pointing to run_agent_on_pr', async () => {
    const { call } = await setup();
    const r = await call('get_findings', { repo: 'acme/payments-api', pr: 3 });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('No finished review on acme/payments-api#3 yet. Start one with run_agent_on_pr.');
  });
});

describe('get_conventions', () => {
  it('returns accepted rules by default with evidence path:line and counts', async () => {
    const state = freshState();
    state.conventions = [
      { category: 'naming', rule: 'Files are kebab-case', evidence_path: 'src/a-b.ts', line_start: 1, status: 'accepted' },
      { category: 'errors', rule: 'Throw AppError', evidence_path: 'src/errors.ts', line_start: null, status: 'pending' },
      { category: 'x', rule: 'Rejected', evidence_path: 'x.ts', line_start: 2, status: 'rejected' },
    ];
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'acme/payments-api' });
    expect(r.structuredContent).toEqual({
      repo: 'acme/payments-api',
      status: 'accepted',
      conventions: [{ rule: 'Files are kebab-case', category: 'naming', evidence: 'src/a-b.ts:1', status: 'accepted' }],
      counts: { accepted: 1, pending: 1, rejected: 1 },
      truncated: 0,
    });
  });

  it('caps the list at MAX_CONVENTIONS and each rule at MAX_RULE_CHARS; counts cover all', async () => {
    const state = freshState();
    state.conventions = Array.from({ length: 60 }, (_, i) => ({
      category: 'c',
      rule: i === 0 ? 'x'.repeat(1000) : `Rule ${i}`,
      evidence_path: `src/f${i}.ts`,
      line_start: i + 1,
      status: 'accepted',
    }));
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'acme/payments-api' });
    const sc = r.structuredContent as { conventions: { rule: string }[]; truncated: number; counts: { accepted: number } };
    expect(sc.conventions).toHaveLength(MAX_CONVENTIONS);
    expect(sc.truncated).toBe(10);
    expect(sc.counts.accepted).toBe(60);
    expect(sc.conventions[0]!.rule.length).toBeLessThanOrEqual(MAX_RULE_CHARS);
    expect(text(r)).toContain('10 more conventions omitted');
  });

  it('nothing accepted but pending exist → hint to ask for pending', async () => {
    const state = freshState();
    state.conventions = [{ category: null, rule: 'R', evidence_path: 'p.ts', line_start: 3, status: 'pending' }];
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'acme/payments-api' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('status "pending"');
  });
});

describe('get_blast_radius', () => {
  it('is an honest stub: not_implemented and no API calls', async () => {
    const { call, state } = await setup();
    const r = await call('get_blast_radius', { repo: 'acme/payments-api', pr: 3 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ status: 'not_implemented', repo: 'acme/payments-api', pr: 3 });
    expect(state.calls).toEqual([]);
  });
});
