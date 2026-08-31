import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiCallError } from '../client.js';
import { captureHandler, stubClient } from '../test-utils.js';
import { registerRunAgentOnPrTool } from './run-agent-on-pr.js';

const REPO = { id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' };
const PR = { id: 'p1', number: 482, title: 'x' };
const AGENT_ID = '1e01a0ca-c0c8-4844-ae5f-c139b070993a';
const RUN_ID = 'run-1';

const args = { repo: 'acme/payments-api', pr: 482, agent: AGENT_ID };

beforeEach(() => {
  process.env.POLL_INTERVAL_MS = '10';
  process.env.POLL_MAX_MS = '25';
});

afterEach(() => {
  delete process.env.POLL_INTERVAL_MS;
  delete process.env.POLL_MAX_MS;
  vi.useRealTimers();
});

describe('run_agent_on_pr', () => {
  it('returns shaped findings when the run is already done on the first poll', async () => {
    const client = stubClient({
      get: async (path: string) => {
        if (path === '/repos') return [REPO];
        if (path === `/repos/${REPO.id}/pulls`) return [PR];
        if (path === `/pulls/${PR.id}/runs`) return [{ run_id: RUN_ID, status: 'done', error: null }];
        if (path === `/pulls/${PR.id}/reviews`) {
          return [{ id: 'rv1', pr_id: PR.id, run_id: RUN_ID, verdict: 'approve', findings: [] }];
        }
        throw new Error(`unexpected GET ${path}`);
      },
      post: async () => ({ pr_id: PR.id, runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'x' }], reviews: [] }),
    });
    const handler = captureHandler(registerRunAgentOnPrTool, client);

    const result = await handler(args);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ verdict: 'approve', findings: [] });
  });

  it('returns a "still running" result with the run_id after the poll budget elapses', async () => {
    vi.useFakeTimers();
    const client = stubClient({
      get: async (path: string) => {
        if (path === '/repos') return [REPO];
        if (path === `/repos/${REPO.id}/pulls`) return [PR];
        if (path === `/pulls/${PR.id}/runs`) return [{ run_id: RUN_ID, status: 'running', error: null }];
        throw new Error(`unexpected GET ${path}`);
      },
      post: async () => ({ pr_id: PR.id, runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'x' }], reviews: [] }),
    });
    const handler = captureHandler(registerRunAgentOnPrTool, client);

    const promise = handler(args);
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ status: 'running', run_id: RUN_ID });
  });

  it('returns isError:true with the run error when the run failed', async () => {
    const client = stubClient({
      get: async (path: string) => {
        if (path === '/repos') return [REPO];
        if (path === `/repos/${REPO.id}/pulls`) return [PR];
        if (path === `/pulls/${PR.id}/runs`) return [{ run_id: RUN_ID, status: 'failed', error: 'llm timeout' }];
        throw new Error(`unexpected GET ${path}`);
      },
      post: async () => ({ pr_id: PR.id, runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'x' }], reviews: [] }),
    });
    const handler = captureHandler(registerRunAgentOnPrTool, client);

    const result = await handler(args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('llm timeout');
  });

  it('returns isError:true when the run was cancelled', async () => {
    const client = stubClient({
      get: async (path: string) => {
        if (path === '/repos') return [REPO];
        if (path === `/repos/${REPO.id}/pulls`) return [PR];
        if (path === `/pulls/${PR.id}/runs`) return [{ run_id: RUN_ID, status: 'cancelled', error: null }];
        throw new Error(`unexpected GET ${path}`);
      },
      post: async () => ({ pr_id: PR.id, runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'x' }], reviews: [] }),
    });
    const handler = captureHandler(registerRunAgentOnPrTool, client);

    const result = await handler(args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cancelled');
  });

  it('rewrites a not_found POST error to name list_agents', async () => {
    const client = stubClient({
      get: async (path: string) => {
        if (path === '/repos') return [REPO];
        if (path === `/repos/${REPO.id}/pulls`) return [PR];
        throw new Error(`unexpected GET ${path}`);
      },
      post: async () => {
        throw new ApiCallError(404, 'not_found', 'Agent not found');
      },
    });
    const handler = captureHandler(registerRunAgentOnPrTool, client);

    const result = await handler(args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('list_agents');
  });
});
