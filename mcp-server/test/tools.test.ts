import { afterEach, describe, expect, it } from 'vitest';
import { MAX_FINDINGS, MAX_RUNS, MAX_TOTAL_FINDINGS, type ReviewsResult } from '../src/format.js';
import { MAX_CONVENTIONS, MAX_RULE_CHARS } from '../src/tools/get-conventions.js';
import { connect, doneRun, finding, freshState, PR_ID, REPO, SECURITY, STYLE, text, type FakeState } from './helpers/harness.js';

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

const RUN_ARGS = { repo: 'acme/payments-api', pr_id: 3, agent_id: 'agent-sec' };
const PR_UUID = '6f1c1a52-3b0e-4a57-9c1d-2f6a8b7d9e10';

describe('tools/list', () => {
  it('exposes exactly the 5 tools with flat, described arguments named repo / pr_id / agent_id / run_id', async () => {
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
    const args = (name: string) => Object.keys(byName[name]!.inputSchema.properties ?? {});
    expect(args('run_agent_on_pr')).toEqual(['repo', 'pr_id', 'agent_id']);
    expect(args('get_findings')).toEqual(['repo', 'pr_id', 'run_id', 'agent_id', 'all_runs']);
    expect(args('get_conventions')).toEqual(['repo', 'status']);
    expect(args('get_blast_radius')).toEqual(['repo', 'pr_id']);
    for (const name of ['run_agent_on_pr', 'get_findings', 'get_blast_radius']) {
      expect(byName[name]!.inputSchema.required ?? [], `${name}: repo must be optional`).not.toContain('repo');
    }
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
  it('returns agent_id, name, model, role, enabled only (no system prompt)', async () => {
    const { call } = await setup();
    const r = await call('list_agents');
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      agents: [
        { agent_id: 'agent-sec', name: 'Security Reviewer', model: SECURITY.model, role: SECURITY.description, enabled: true },
        { agent_id: 'agent-style', name: 'Style Reviewer', model: STYLE.model, role: 'Naming and style.', enabled: false },
      ],
    });
    expect(text(r)).toContain('[agent_id agent-sec]');
  });
});

describe('repo and pr_id resolution', () => {
  function twoRepos(): FakeState {
    const state = freshState();
    state.pullsByRepo = {
      'repo-1': [{ id: PR_ID, number: 3, title: 'Add payments webhook' }],
      'repo-2': [
        { id: PR_UUID, number: 3, title: 'Docs for webhooks' },
        { id: '7a2d2b63-4c1f-4b68-8d2e-3f7b9c8e0f21', number: 15, title: 'Blast radius card' },
      ],
    };
    return state;
  }

  const BLAST = {
    pr_id: 'x',
    head_sha: 'h',
    indexed_sha: null,
    link_sha: 'h',
    changed_symbols: [],
    downstream: [],
    unattributed_endpoints: [],
    summary: '',
    counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    callers_omitted: 0,
    degraded: false,
    reason: null,
  };

  it.each([
    ['owner/name', { repo: 'acme/payments-api', pr_id: 3 }, PR_ID],
    ['bare name', { repo: 'payments-api', pr_id: 3 }, PR_ID],
    ['repo UUID-like id', { repo: 'repo-2', pr_id: '#3' }, PR_UUID],
    ['numeric string', { repo: 'lindigo/dev-digest', pr_id: '15' }, '7a2d2b63-4c1f-4b68-8d2e-3f7b9c8e0f21'],
    ['PR UUID without repo', { pr_id: PR_UUID.toUpperCase() }, PR_UUID],
    ['unique title part without repo', { pr_id: 'BLAST radius' }, '7a2d2b63-4c1f-4b68-8d2e-3f7b9c8e0f21'],
  ])('finds the PR by %s', async (_label, args, expectedId) => {
    const state = twoRepos();
    state.blast = BLAST;
    const { call } = await setup(state);
    const r = await call('get_blast_radius', args);
    expect(r.isError, text(r)).toBeFalsy();
    expect((r.structuredContent as { pr_id: string }).pr_id).toBe(expectedId);
    expect(state.calls).toContain(`GET /pulls/${expectedId}/blast`);
  });

  it('a number present in several repos without repo → isError listing owner/name#N title', async () => {
    const { call, state } = await setup(twoRepos());
    const r = await call('get_findings', { pr_id: 3 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('matches 2 pull requests');
    expect(text(r)).toContain('acme/payments-api#3 Add payments webhook');
    expect(text(r)).toContain('lindigo/dev-digest#3 Docs for webhooks');
    expect(state.calls.some((c) => c.includes('/runs'))).toBe(false);
  });

  it('an ambiguous title part → isError with the candidates', async () => {
    const { call } = await setup(twoRepos());
    const r = await call('get_findings', { pr_id: 'webhook' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('acme/payments-api#3 Add payments webhook');
    expect(text(r)).toContain('lindigo/dev-digest#3 Docs for webhooks');
  });

  it('an ambiguous bare repo name → isError asking for owner/name', async () => {
    const state = freshState();
    state.repos.push({ id: 'repo-3', owner: 'other', name: 'payments-api', full_name: 'other/payments-api' });
    const { call } = await setup(state);
    const r = await call('get_findings', { repo: 'payments-api', pr_id: 3 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('acme/payments-api, other/payments-api');
  });

  it('unknown PR in a given repo → isError suggesting gh pr list; unknown repo lists imported ones', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, pr_id: 999 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('PR #999 not found in acme/payments-api');
    expect(text(r)).toContain('gh pr list -R acme/payments-api');
    const r2 = await call('run_agent_on_pr', { ...RUN_ARGS, repo: 'acme/unknown' });
    expect(r2.isError).toBe(true);
    expect(text(r2)).toContain('Imported: acme/payments-api, lindigo/dev-digest');
  });
});

describe('run_agent_on_pr', () => {
  it('happy path: starts, waits for done and returns full findings sorted by severity, with model and cost', async () => {
    const state = freshState();
    state.newRunFindings = [finding('SUGGESTION', 1), finding('CRITICAL', 2), finding('WARNING', 3)];
    const { call } = await setup(state);
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      status: 'done',
      run_id: 'run-new',
      repo: 'acme/payments-api',
      pr_number: 3,
      pr_id: PR_ID,
      review_id: 'review-run-new',
      agent_id: 'agent-sec',
      agent: 'Security Reviewer',
      model: SECURITY.model,
      cost_usd: 0.0042,
      verdict: 'request_changes',
      counts: { critical: 1, warning: 1, suggestion: 1 },
      truncated: 0,
    });
    const sc = r.structuredContent as { findings: Record<string, unknown>[] };
    expect(sc.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    expect(sc.findings[0]).toEqual({
      severity: 'CRITICAL',
      category: 'security',
      title: 'CRITICAL issue 2',
      file: 'src/f2.ts',
      start_line: 12,
      rationale: 'Why CRITICAL 2 matters.',
      suggestion: 'Fix 2.',
    });
    expect(state.calls).toContain(`POST /pulls/${PR_ID}/review`);
    expect(text(r)).toContain('1 CRITICAL, 1 WARNING, 1 SUGGESTION');
    expect(text(r)).toContain('$0.0042');
  });

  it('accepts the exact agent name case-insensitively as agent_id', async () => {
    const { call } = await setup();
    const byName = await call('run_agent_on_pr', { ...RUN_ARGS, agent_id: 'security reviewer' });
    expect(byName.isError).toBeFalsy();
    expect(byName.structuredContent).toMatchObject({ agent_id: 'agent-sec' });
  });

  it('works without repo (PR found across imported repos)', async () => {
    const { call } = await setup();
    const r = await call('run_agent_on_pr', { pr_id: 3, agent_id: 'agent-sec' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ repo: 'acme/payments-api', pr_number: 3 });
  });

  it('unknown agent → isError pointing to list_agents, no run started', async () => {
    const { call, state } = await setup();
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, agent_id: 'Perf Wizard' });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Agent "Perf Wizard" not found. Call list_agents to see available agents.');
    expect(state.calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('run timeout → status running + run_id + hint to call get_findings with pr_id (not an error)', async () => {
    const state = freshState();
    state.runStatusSequence = ['running'];
    const { call } = await setup(state, { runTimeoutMs: 30, pollMs: 5 });
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ status: 'running', run_id: 'run-new', findings: [], cost_usd: null });
    const next = (r.structuredContent as { next_step: string }).next_step;
    expect(next).toContain('get_findings');
    expect(next).toContain('pr_id 3');
    expect(next).toContain('run-new');
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
    const r = await call('run_agent_on_pr', { ...RUN_ARGS, agent_id: 'Style Reviewer' });
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

describe('truncation and counts (one run)', () => {
  it('counts every active finding, caps the list and never drops a CRITICAL', async () => {
    const state = freshState();
    const criticals = Array.from({ length: MAX_FINDINGS + 2 }, (_, i) => finding('CRITICAL', i));
    const suggestions = Array.from({ length: 5 }, (_, i) => finding('SUGGESTION', 100 + i));
    // suggestions first, so a naive slice would keep them and drop criticals
    state.newRunFindings = [...suggestions, ...criticals, finding('WARNING', 200, { dismissed_at: '2026-11-01T00:00:00Z' })];
    const { call } = await setup(state);
    const sc = (await call('run_agent_on_pr', RUN_ARGS)).structuredContent as {
      counts: Record<string, number>;
      findings: { severity: string }[];
      truncated: number;
    };
    expect(sc.counts).toEqual({ critical: MAX_FINDINGS + 2, warning: 0, suggestion: 5 }); // dismissed excluded
    expect(sc.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(MAX_FINDINGS + 2);
    expect(sc.findings.some((f) => f.severity === 'SUGGESTION')).toBe(false);
    expect(sc.truncated).toBe(5);
  });

  it('caps a long list at MAX_FINDINGS, shortens long texts and reports truncated', async () => {
    const state = freshState();
    state.newRunFindings = [
      finding('CRITICAL', 0, { rationale: 'r'.repeat(1000), suggestion: 's\n'.repeat(500) }),
      ...Array.from({ length: 40 }, (_, i) => finding('SUGGESTION', i + 1)),
    ];
    const { call } = await setup(state);
    const sc = (await call('run_agent_on_pr', RUN_ARGS)).structuredContent as {
      counts: Record<string, number>;
      findings: { severity: string; rationale: string; suggestion: string }[];
      truncated: number;
    };
    expect(sc.findings).toHaveLength(MAX_FINDINGS);
    expect(sc.findings[0]!.severity).toBe('CRITICAL');
    expect(sc.findings[0]!.rationale.length).toBeLessThanOrEqual(300);
    expect(sc.findings[0]!.suggestion.length).toBeLessThanOrEqual(300);
    expect(sc.findings[0]!.suggestion).not.toContain('\n');
    expect(sc.counts).toEqual({ critical: 1, warning: 0, suggestion: 40 });
    expect(sc.truncated).toBe(41 - MAX_FINDINGS);
  });
});

describe('get_findings', () => {
  /** Newest first: style (latest), sec (latest), sec (older). */
  function withHistory(): FakeState {
    const state = freshState();
    const style = doneRun('run-style', STYLE, [finding('SUGGESTION', 1)], { cost: 0.001 });
    const sec = doneRun('run-sec', SECURITY, [finding('CRITICAL', 1)], { cost: 0.02 });
    const secOld = doneRun('run-sec-old', SECURITY, [finding('WARNING', 2)]);
    state.runs = [style.run, sec.run, secOld.run];
    state.reviews = [style.review, sec.review, secOld.review];
    return state;
  }
  const PR = { repo: 'acme/payments-api', pr_id: 3 };

  it('default → the latest finished run of EVERY agent, grouped, with review metadata and cost', async () => {
    const { call } = await setup(withHistory());
    const r = await call('get_findings', PR);
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as ReviewsResult;
    expect(sc.status).toBe('done');
    expect(sc.pr_number).toBe(3);
    expect(sc.pr_id).toBe(PR_ID);
    expect(sc.reviews.map((g) => g.run_id)).toEqual(['run-style', 'run-sec']);
    expect(sc.reviews[1]).toMatchObject({
      review_id: 'review-run-sec',
      agent_id: 'agent-sec',
      agent_name: 'Security Reviewer',
      verdict: 'request_changes',
      score: 40,
      model: SECURITY.model,
      created_at: '2026-11-08T10:00:00.000Z',
      cost_usd: 0.02,
      counts: { critical: 1, warning: 0, suggestion: 0 },
    });
    expect(sc.counts).toEqual({ critical: 1, warning: 0, suggestion: 1 });
    expect(sc.runs_omitted).toBe(0);
    expect(sc.running).toEqual([]);
  });

  it('all_runs → every finished run, newest first', async () => {
    const { call } = await setup(withHistory());
    const sc = (await call('get_findings', { ...PR, all_runs: true })).structuredContent as ReviewsResult;
    expect(sc.reviews.map((g) => g.run_id)).toEqual(['run-style', 'run-sec', 'run-sec-old']);
  });

  it('agent_id → that agent only (latest; all_runs → its history)', async () => {
    const { call } = await setup(withHistory());
    const latest = (await call('get_findings', { ...PR, agent_id: 'SECURITY REVIEWER' })).structuredContent as ReviewsResult;
    expect(latest.reviews.map((g) => g.run_id)).toEqual(['run-sec']);
    const all = (await call('get_findings', { ...PR, agent_id: 'agent-sec', all_runs: true })).structuredContent as ReviewsResult;
    expect(all.reviews.map((g) => g.run_id)).toEqual(['run-sec', 'run-sec-old']);
  });

  it('run_id → exactly that run', async () => {
    const { call } = await setup(withHistory());
    const sc = (await call('get_findings', { ...PR, run_id: 'run-sec-old' })).structuredContent as ReviewsResult;
    expect(sc.reviews.map((g) => g.run_id)).toEqual(['run-sec-old']);
  });

  it(`caps all_runs at MAX_RUNS (${MAX_RUNS}) and reports runs_omitted`, async () => {
    const state = freshState();
    const runs = Array.from({ length: MAX_RUNS + 3 }, (_, i) => doneRun(`run-${i}`, SECURITY, []));
    state.runs = runs.map((x) => x.run);
    state.reviews = runs.map((x) => x.review);
    const { call } = await setup(state);
    const sc = (await call('get_findings', { ...PR, all_runs: true })).structuredContent as ReviewsResult;
    expect(sc.reviews).toHaveLength(MAX_RUNS);
    expect(sc.runs_omitted).toBe(3);
    expect(text((await call('get_findings', { ...PR, all_runs: true })))).toContain('3 older runs not shown');
  });

  it(`caps findings at ${MAX_TOTAL_FINDINGS} overall and ${MAX_FINDINGS} per run, never dropping a CRITICAL`, async () => {
    const state = freshState();
    // 3 agents' runs × 30 suggestions + 1 critical in the last one
    const many = (n: number, sev: string) => Array.from({ length: n }, (_, i) => finding(sev, i));
    const a = doneRun('run-a', SECURITY, many(30, 'SUGGESTION'));
    const b = doneRun('run-b', STYLE, many(30, 'SUGGESTION'));
    const third = { ...SECURITY, id: 'agent-3', name: 'Third' };
    state.agents.push(third);
    const c = doneRun('run-c', third, [...many(30, 'SUGGESTION'), finding('CRITICAL', 99)]);
    state.runs = [a.run, b.run, c.run];
    state.reviews = [a.review, b.review, c.review];
    const { call } = await setup(state);
    const sc = (await call('get_findings', PR)).structuredContent as ReviewsResult;
    const per = sc.reviews.map((g) => g.findings.length);
    expect(per).toEqual([MAX_FINDINGS, MAX_FINDINGS, 1 + 0 + (MAX_TOTAL_FINDINGS - 2 * MAX_FINDINGS - 1)]);
    expect(per.reduce((x, y) => x + y, 0)).toBe(MAX_TOTAL_FINDINGS);
    expect(sc.reviews[2]!.findings[0]!.severity).toBe('CRITICAL');
    expect(sc.counts).toEqual({ critical: 1, warning: 0, suggestion: 90 });
    expect(sc.truncated).toBe(91 - MAX_TOTAL_FINDINGS);
  });

  it('a newer run still going is listed in running[] next to the last finished result', async () => {
    const state = withHistory();
    state.runs.unshift({ run_id: 'run-live', agent_id: 'agent-sec', agent_name: 'Security Reviewer', status: 'running', error: null, ran_at: null });
    const { call } = await setup(state);
    const sc = (await call('get_findings', PR)).structuredContent as ReviewsResult;
    expect(sc.status).toBe('done');
    expect(sc.running).toEqual([{ run_id: 'run-live', agent_id: 'agent-sec', agent_name: 'Security Reviewer' }]);
    expect(sc.next_step).toContain('run-live');
  });

  it('run_id of a running run → status running with next_step, no reviews', async () => {
    const state = withHistory();
    state.runs.unshift({ run_id: 'run-live', agent_id: 'agent-sec', agent_name: 'Security Reviewer', status: 'running', error: null, ran_at: null });
    const { call } = await setup(state);
    const sc = (await call('get_findings', { ...PR, run_id: 'run-live' })).structuredContent as ReviewsResult;
    expect(sc).toMatchObject({ status: 'running', reviews: [] });
    expect(sc.next_step).toContain('run-live');
  });

  it('unknown run_id → isError suggesting to omit it', async () => {
    const { call } = await setup(withHistory());
    const r = await call('get_findings', { ...PR, run_id: 'nope' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Omit run_id');
  });

  it('no runs at all → isError pointing to run_agent_on_pr', async () => {
    const { call } = await setup();
    const r = await call('get_findings', PR);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('No finished review on acme/payments-api#3 yet. Start one with run_agent_on_pr.');
  });
});

describe('get_conventions', () => {
  const conv = (rule: string, extra: Record<string, unknown> = {}) => ({
    category: 'naming',
    rule,
    evidence_path: 'src/a-b.ts',
    line_start: 1,
    confidence: 0.8,
    status: 'accepted',
    ...extra,
  });

  it('returns accepted rules by default with evidence path:line, confidence and counts', async () => {
    const state = freshState();
    state.conventions = [
      conv('Files are kebab-case'),
      conv('Throw AppError', { category: 'errors', evidence_path: 'src/errors.ts', line_start: null, status: 'pending' }),
      conv('Rejected', { category: 'x', status: 'rejected' }),
    ];
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'payments-api' });
    expect(r.structuredContent).toEqual({
      repo: 'acme/payments-api',
      status: 'accepted',
      conventions: [
        { rule: 'Files are kebab-case', category: 'naming', evidence: 'src/a-b.ts:1', confidence: 0.8, status: 'accepted', duplicates: 0 },
      ],
      counts: { accepted: 1, pending: 1, rejected: 1 },
      deduplicated: 0,
      truncated: 0,
    });
  });

  it('merges duplicate rules (case / whitespace / trailing dot), keeping the most confident evidence', async () => {
    const state = freshState();
    state.conventions = [
      conv('Files are kebab-case', { confidence: 0.6, evidence_path: 'low.ts' }),
      conv('files  are KEBAB-case.', { confidence: 0.9, evidence_path: 'high.ts', line_start: 7 }),
      conv('Files are kebab-case', { confidence: 0.7, evidence_path: 'mid.ts' }),
      conv('Files are kebab-case .', { confidence: 0.1, evidence_path: 'spaced.ts' }), // space before the dot
      conv('Throw AppError'),
    ];
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: REPO.id });
    const sc = r.structuredContent as { conventions: { rule: string; evidence: string; duplicates: number }[]; deduplicated: number };
    expect(sc.conventions).toHaveLength(2);
    expect(sc.conventions[0]).toMatchObject({ evidence: 'high.ts:7', duplicates: 3 });
    expect(sc.deduplicated).toBe(3);
    expect(text(r)).toContain('3 duplicate rules merged');
  });

  it('caps the list at MAX_CONVENTIONS and each rule at MAX_RULE_CHARS; counts cover all', async () => {
    const state = freshState();
    state.conventions = Array.from({ length: 60 }, (_, i) =>
      conv(i === 0 ? 'x'.repeat(1000) : `Rule ${i}`, { evidence_path: `src/f${i}.ts`, line_start: i + 1 }),
    );
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'acme/payments-api' });
    const sc = r.structuredContent as { conventions: { rule: string }[]; truncated: number; counts: { accepted: number } };
    expect(sc.conventions).toHaveLength(MAX_CONVENTIONS);
    expect(sc.truncated).toBe(10);
    expect(sc.counts.accepted).toBe(60);
    expect(sc.conventions[0]!.rule.length).toBeLessThanOrEqual(MAX_RULE_CHARS);
    expect(text(r)).toContain('10 more conventions omitted');
  });

  it('ignores an unknown status in counts (no prototype keys)', async () => {
    const state = freshState();
    state.conventions = [conv('R', { status: 'toString' }), conv('S')];
    const { call } = await setup(state);
    const sc = (await call('get_conventions', { repo: 'acme/payments-api' })).structuredContent as { counts: Record<string, number> };
    expect(sc.counts).toEqual({ accepted: 1, pending: 0, rejected: 0 });
  });

  it('nothing accepted but pending exist → hint to ask for pending', async () => {
    const state = freshState();
    state.conventions = [conv('R', { category: null, status: 'pending' })];
    const { call } = await setup(state);
    const r = await call('get_conventions', { repo: 'acme/payments-api' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('status "pending"');
  });
});
