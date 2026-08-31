import { describe, expect, it } from 'vitest';
import { captureHandler, stubClient } from '../test-utils.js';
import { registerGetFindingsTool } from './get-findings.js';

const REPO = { id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' };
const PR = { id: 'p1', number: 482, title: 'x' };

function clientWithRuns(runs: unknown[], reviews: unknown[] = []) {
  return stubClient({
    get: async (path: string) => {
      if (path === '/repos') return [REPO];
      if (path === `/repos/${REPO.id}/pulls`) return [PR];
      if (path === `/pulls/${PR.id}/runs`) return runs;
      if (path === `/pulls/${PR.id}/reviews`) return reviews;
      throw new Error(`unexpected GET ${path}`);
    },
  });
}

describe('get_findings', () => {
  it('returns shaped findings for a done run', async () => {
    const handler = captureHandler(
      registerGetFindingsTool,
      clientWithRuns(
        [{ run_id: 'run1', status: 'done', error: null }],
        [{ id: 'rv1', pr_id: PR.id, run_id: 'run1', verdict: 'comment', findings: [] }],
      ),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ verdict: 'comment' });
  });

  it('returns a non-error "check again shortly" result for a running run', async () => {
    const handler = captureHandler(
      registerGetFindingsTool,
      clientWithRuns([{ run_id: 'run1', status: 'running', error: null }]),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ status: 'running' });
  });

  it('returns isError:true naming retry for a failed run', async () => {
    const handler = captureHandler(
      registerGetFindingsTool,
      clientWithRuns([{ run_id: 'run1', status: 'failed', error: 'boom' }]),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('run_agent_on_pr');
  });

  it('returns isError:true for a cancelled run', async () => {
    const handler = captureHandler(
      registerGetFindingsTool,
      clientWithRuns([{ run_id: 'run1', status: 'cancelled', error: null }]),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBe(true);
  });

  it('returns isError:true naming run_agent_on_pr when no run exists at all', async () => {
    const handler = captureHandler(registerGetFindingsTool, clientWithRuns([]));
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('run_agent_on_pr');
  });

  it('picks the exact run_id when given, and errors if it does not match', async () => {
    const handler = captureHandler(
      registerGetFindingsTool,
      clientWithRuns([{ run_id: 'run1', status: 'done', error: null }]),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482, run_id: 'run-does-not-exist' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('run-does-not-exist');
  });
});
