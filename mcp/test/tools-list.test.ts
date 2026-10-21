import { describe, it, expect } from 'vitest';
import { connect } from './connect.js';

const NAMES = [
  'devdigest_list_agents',
  'devdigest_run_agent_on_pr',
  'devdigest_get_findings',
  'devdigest_get_conventions',
  'devdigest_get_blast_radius',
];
const TITLES = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z])/).length;

describe('tools/list', () => {
  it('exposes exactly five tools in order with titles and descriptions of 3-4 sentences', async () => {
    const { client } = await connect(() => undefined);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(NAMES);
    expect(tools.map((t) => t.title)).toEqual(TITLES);
    for (const t of tools) {
      expect(t.description!.length).toBeLessThan(2048);
      const n = sentences(t.description!);
      expect(n, t.name).toBeGreaterThanOrEqual(3);
      expect(n, t.name).toBeLessThanOrEqual(4);
    }
  });

  it('sets the annotations table', async () => {
    const { client } = await connect(() => undefined);
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of NAMES.filter((x) => x !== 'devdigest_run_agent_on_pr')) {
      expect(by[n]!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
    expect(by.devdigest_run_agent_on_pr!.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true,
    });
  });

  it('requiresUserInteraction only on the run tool; no alwaysLoad anywhere', async () => {
    const { client } = await connect(() => undefined);
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t._meta?.['anthropic/alwaysLoad']).toBeUndefined();
      if (t.name === 'devdigest_run_agent_on_pr') expect(t._meta?.['anthropic/requiresUserInteraction']).toBe(true);
      else expect(t._meta?.['anthropic/requiresUserInteraction']).toBeUndefined();
    }
  });

  it('server instructions are at most 4 sentences and under 2048 chars', async () => {
    const { client } = await connect(() => undefined);
    const ins = client.getInstructions()!;
    expect(ins.length).toBeLessThan(2048);
    expect(sentences(ins)).toBeLessThanOrEqual(4);
  });

  it('blast radius rejects a call without a target at the protocol layer', async () => {
    const { client } = await connect(() => undefined);
    const res = await client.callTool({ name: 'devdigest_get_blast_radius', arguments: {} }).catch((e) => e);
    const isErr = res instanceof Error || (res as { isError?: boolean }).isError === true;
    expect(isErr).toBe(true);
  });
});
