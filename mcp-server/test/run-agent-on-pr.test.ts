import { afterEach, describe, expect, it } from 'vitest';
import type { ApiRun } from '../src/api-client.js';
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

const RUN_ARGS = { repo: 'acme/payments-api', pr: 3, agent: 'Security Reviewer' };

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
    expect(text(r)).toContain('Pass the id');
    expect(postCount(state)).toBe(0);
  });

  it('accepts pr as a numeric string and rejects a non-number', async () => {
    const { call } = await setup();
    const ok = await call('run_agent_on_pr', { ...RUN_ARGS, pr: '3' });
    expect(ok.isError).toBeFalsy();
    expect((ok.structuredContent as { status: string }).status).toBe('done');

    const bad = await call('run_agent_on_pr', { ...RUN_ARGS, pr: 'abc' });
    expect(bad.isError).toBe(true);
  });

  it('keeps pr a flat integer in the tool schema', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'run_agent_on_pr')!;
    const pr = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).pr!;
    expect(pr.type).toBe('integer');
    expect(pr.anyOf).toBeUndefined();
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
