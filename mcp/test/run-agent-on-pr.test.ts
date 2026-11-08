import { afterEach, describe, expect, it } from 'vitest';
import type { ApiRun } from '../src/api-client.js';
import { DEFAULT_RUN_TIMEOUT_MS, loadConfig, TYPICAL_CLIENT_TIMEOUT_MS } from '../src/config.js';
import { connect, freshState, SECURITY, text, type FakeState } from './helpers/harness.js';

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

const RUN_ARGS = { repo: 'acme/payments-api', pr_id: 3, agent_id: 'Security Reviewer' };

function runningRun(agentId: string, runId: string): ApiRun {
  return { run_id: runId, agent_id: agentId, agent_name: 'x', status: 'running', error: null, ran_at: null };
}

const postCount = (state: FakeState) => state.calls.filter((c) => c.startsWith('POST ')).length;
const runPolls = (state: FakeState) => state.calls.filter((c) => c === 'GET /pulls/pr-uuid-3/runs').length;
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('run_agent_on_pr: active run reuse', () => {
  it('waits for an already running run of the same agent instead of starting a new one', async () => {
    const state = freshState();
    state.runs = [runningRun(SECURITY.id, 'run-existing')];
    state.trackedRunId = 'run-existing';
    const { call } = await setup(state);

    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(postCount(state)).toBe(0);
    const sc = r.structuredContent as { run_id: string; warning?: string; status: string };
    expect(sc.status).toBe('done');
    expect(sc.run_id).toBe('run-existing');
    expect(sc.warning).toContain('already running');
  });

  it('does not reuse a running run of another agent', async () => {
    const state = freshState();
    state.runs = [runningRun('agent-style', 'run-other')];
    const { call } = await setup(state);

    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(postCount(state)).toBe(1);
    expect((r.structuredContent as { run_id: string }).run_id).toBe('run-new');
  });
});

describe('run_agent_on_pr: progress and cancellation', () => {
  it('sends strictly increasing progress notifications when the client asks for them', async () => {
    const state = freshState();
    state.runStatusSequence = ['running', 'running', 'done'];
    const { client } = await setup(state);

    const seen: number[] = [];
    const r = await client.callTool(
      { name: 'run_agent_on_pr', arguments: RUN_ARGS },
      undefined,
      { onprogress: (p) => seen.push(p.progress) },
    );
    expect(r.isError).toBeFalsy();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  it('sends no progress without a progress token', async () => {
    const state = freshState();
    state.runStatusSequence = ['running', 'running', 'done'];
    const { client, serverSent } = await setup(state);

    const r = await client.callTool({ name: 'run_agent_on_pr', arguments: RUN_ARGS });
    expect(r.isError).toBeFalsy();
    expect(serverSent.filter((m) => m === 'notifications/progress')).toHaveLength(0);
  });

  it('stops polling after the client aborts', async () => {
    const state = freshState();
    state.runStatusSequence = ['running']; // never finishes
    const { client } = await setup(state, { pollMs: 10, runTimeoutMs: 30_000 });

    const ac = new AbortController();
    const pending = client.callTool(
      { name: 'run_agent_on_pr', arguments: RUN_ARGS },
      undefined,
      { signal: ac.signal, onprogress: () => ac.abort() },
    );
    await expect(pending).rejects.toBeDefined();

    await sleepMs(30); // let the abort reach the server
    const after = runPolls(state);
    await sleepMs(60);
    expect(runPolls(state)).toBe(after);
  });
});

describe('run_agent_on_pr: arguments and errors', () => {
  it('reports an ambiguous agent name with both ids and starts nothing', async () => {
    const state = freshState();
    state.agents = [SECURITY, { ...SECURITY, id: 'agent-sec-2' }];
    const { call } = await setup(state);

    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('agent-sec');
    expect(text(r)).toContain('agent-sec-2');
    expect(text(r)).toContain('Pass the agent_id');
    expect(postCount(state)).toBe(0);
  });

  it('accepts pr_id as "#3" and rejects a title part that matches nothing (no run started)', async () => {
    const { call, state } = await setup();
    const ok = await call('run_agent_on_pr', { ...RUN_ARGS, pr_id: '#3' });
    expect(ok.isError).toBeFalsy();
    expect((ok.structuredContent as { status: string }).status).toBe('done');

    const before = postCount(state);
    const bad = await call('run_agent_on_pr', { ...RUN_ARGS, pr_id: 'abc' });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('No PR title in acme/payments-api contains "abc"');
    expect(postCount(state)).toBe(before);
  });

  it('keeps pr_id a flat scalar (number or string) in the tool schema', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'run_agent_on_pr')!;
    const pr = (tool.inputSchema.properties as Record<string, { anyOf?: { type?: string }[] }>).pr_id!;
    expect(pr.anyOf?.map((s) => s.type).sort()).toEqual(['integer', 'string']);
  });

  it('explains a 402 failure with a top-up hint', async () => {
    const state = freshState();
    state.runStatusSequence = ['failed'];
    const { call } = await setup(state);

    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('OpenRouter 402');
    expect(text(r)).toContain('credits');
    expect(text(r)).toContain('retry run_agent_on_pr');
  });

  it('adds a next step to a generic API error', async () => {
    const state = freshState();
    state.reviewStatus = 404;
    const { call } = await setup(state);

    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('404');
    expect(text(r)).toContain('list_agents');
  });
});

describe('run_agent_on_pr: wait budget below client limits', () => {
  it('the default wait is a constant below the typical client limit (Inspector: 60 s total)', () => {
    expect(DEFAULT_RUN_TIMEOUT_MS).toBe(50_000);
    expect(DEFAULT_RUN_TIMEOUT_MS).toBeLessThan(TYPICAL_CLIENT_TIMEOUT_MS);
    expect(loadConfig({}).runTimeoutMs).toBe(DEFAULT_RUN_TIMEOUT_MS);
    expect(loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: '120000' }).runTimeoutMs).toBe(120_000); // opt-in for larger clients
    expect(loadConfig({ DEVDIGEST_RUN_TIMEOUT_MS: 'nope' }).runTimeoutMs).toBe(DEFAULT_RUN_TIMEOUT_MS);
  });

  it('counts the budget from the start of the call: slow resolution leaves one status check, then "running" + get_findings', async () => {
    const state = freshState();
    state.runStatusSequence = ['running'];
    state.latencyMs = 60; // ~5 calls before polling = 300 ms > the 150 ms budget
    const { call } = await setup(state, { runTimeoutMs: 150, pollMs: 1 });
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ status: 'running', run_id: 'run-new' });
    expect((r.structuredContent as { next_step: string }).next_step).toContain('get_findings');
    // 1 dedup lookup before the start + exactly 1 status check after it (budget already spent)
    expect(runPolls(state)).toBe(2);
  });

  it('a run that finished during slow resolution is still returned as done (one check after the budget)', async () => {
    const state = freshState();
    state.runStatusSequence = ['done'];
    state.latencyMs = 60;
    const { call } = await setup(state, { runTimeoutMs: 150, pollMs: 1 });
    const r = await call('run_agent_on_pr', RUN_ARGS);
    expect(r.structuredContent).toMatchObject({ status: 'done', run_id: 'run-new' });
  });
});
