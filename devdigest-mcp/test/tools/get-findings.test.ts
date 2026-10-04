import { afterEach, describe, expect, it } from 'vitest';
import type { PrMeta, Repo, ReviewRecord, RunSummary } from '@devdigest/shared';
import {
  closeClients,
  connectClient,
  fakePort,
  findingFixture,
  prFixture,
  repoFixture,
  reviewFixture,
  RUN_ID,
  runFixture,
  textOf,
} from '../helpers/fixtures.js';

afterEach(closeClients);

function port(reviews: Record<string, unknown>[], runs: Record<string, unknown>[] = []) {
  return fakePort({
    listRepos: async () => [repoFixture()] as unknown as Repo[],
    listPulls: async () => [prFixture()] as unknown as PrMeta[],
    listReviews: async () => reviews as unknown as ReviewRecord[],
    listRuns: async () => runs as unknown as RunSummary[],
  });
}
const args = { repo: 'acme/api', pr: 42, run_id: RUN_ID };

describe('get_findings tool', () => {
  it('registers verbatim and returns trimmed, severity-sorted findings without dismissed ones', async () => {
    const long = 'r'.repeat(900);
    const review = reviewFixture({
      summary: 's'.repeat(900),
      findings: [
        findingFixture({ id: '1', severity: 'SUGGESTION', title: 'sug' }),
        findingFixture({ id: '2', severity: 'CRITICAL', title: 'crit', rationale: long, suggestion: 'x'.repeat(500) }),
        findingFixture({ id: '3', severity: 'WARNING', title: 'warn', dismissed_at: '2026-10-01T00:00:00Z' }),
        findingFixture({ id: '4', severity: 'WARNING', title: 'warn2' }),
      ],
    });
    const client = await connectClient(
      port([reviewFixture({ id: 'sum', kind: 'summary', verdict: null, run_id: RUN_ID, findings: [] }), review]),
    );
    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_findings')!;
    expect(tool.description).toBe('Get the verdict and findings from a specific completed review run.');
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });

    const res = await client.callTool({ name: 'get_findings', arguments: args });
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(textOf(res));
    expect(data).toMatchObject({
      verdict: 'request_changes',
      total: 3,
      returned: 3,
      truncated: false,
      dismissed_count: 1,
      counts: { CRITICAL: 1, WARNING: 1, SUGGESTION: 1 },
    });
    expect(data.findings.map((f: { title: string }) => f.title)).toEqual(['crit', 'warn2', 'sug']);
    expect(data.findings[0].rationale.length).toBe(400);
    expect(data.findings[0].suggestion.length).toBe(300);
    expect(data.summary.length).toBe(600);
    expect(Object.keys(data.findings[1]).sort()).toEqual(
      ['category', 'end_line', 'file', 'rationale', 'severity', 'start_line', 'title'],
    );

    const capped = JSON.parse(textOf(await client.callTool({ name: 'get_findings', arguments: { ...args, limit: 1 } })));
    expect(capped).toMatchObject({ total: 3, returned: 1, truncated: true });
  });

  it('maps run states: running, failed, cancelled, absent', async () => {
    const run = (over: Record<string, unknown>) => port([], [runFixture(over)]);
    const call = async (api: ReturnType<typeof port>) =>
      textOf(await (await connectClient(api)).callTool({ name: 'get_findings', arguments: args }));
    expect(await call(run({ status: 'running' }))).toContain('is still in progress');
    expect(await call(run({ status: null }))).toContain('is still in progress');
    expect(await call(run({ status: 'failed', error: 'boom '.repeat(100) }))).toMatch(/failed: boom.*…\./);
    expect(await call(run({ status: 'cancelled' }))).toContain('was cancelled');
    expect(await call(run({ status: 'done' }))).toContain('no review was persisted');
    const absent = await call(port([], []));
    expect(absent).toContain(`No review found for run_id "${RUN_ID}" on PR #42 in "acme/api"`);
  });

  it('rejects a non-uuid run_id and a non-positive pr before any API call', async () => {
    const client = await connectClient(fakePort({}));
    expect((await client.callTool({ name: 'get_findings', arguments: { ...args, run_id: 'abc' } })).isError).toBe(true);
    expect((await client.callTool({ name: 'get_findings', arguments: { ...args, pr: -1 } })).isError).toBe(true);
  });
});
