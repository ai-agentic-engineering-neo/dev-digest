// Registration contract: exactly the 5 tools of specs/01-mcp-server.md, with
// name / description / annotations copied VERBATIM (literals below are the spec's
// text, not imported from src/, so a drift in src/ fails here).
import { afterEach, describe, expect, it } from 'vitest';
import { closeClients, connectClient, fakePort } from './helpers/fixtures.js';

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true };

const SPEC: Record<string, { description: string; annotations: Record<string, boolean>; required: string[] }> = {
  list_agents: {
    description: 'List the review agents configured in this workspace, with the agent id other tools need.',
    annotations: READ_ONLY,
    required: [],
  },
  get_conventions: {
    description: "Get this repo's accepted coding conventions (naming, structure, etc.) with evidence.",
    annotations: READ_ONLY,
    required: ['repo'],
  },
  get_findings: {
    description: 'Get the verdict and findings from a specific completed review run.',
    annotations: READ_ONLY,
    required: ['repo', 'pr', 'run_id'],
  },
  run_agent_on_pr: {
    description:
      'Run a review agent on a pull request and return its findings once the run finishes (up to ~2 minutes).',
    annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: true },
    required: ['repo', 'pr', 'agent'],
  },
  get_blast_radius: {
    description:
      
      'Get the blast radius of a pull request: what else in the repo the diff can affect. Call it when reviewing or judging a PR, especially one that changes a shared function or module, before deciding how risky it is. Returns the changed-symbol count, downstream callers per symbol as file:line, affected HTTP endpoints and crons, and whether the repo index was degraded (if degraded, missing callers are not proof the change is safe). Long results are trimmed; the "omitted" counts say what was cut.',
    annotations: READ_ONLY,
    required: ['repo', 'pr'],
  },
};

type Prop = Record<string, unknown>;

afterEach(closeClients);

async function listTools() {
  const client = await connectClient(fakePort({}));
  return (await client.listTools()).tools;
}

describe('tool registration', () => {
  it('registers exactly the 5 spec tools, no more, no fewer', async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(SPEC).sort());
    expect(tools).toHaveLength(5);
  });

  it('matches name, description and annotations verbatim', async () => {
    for (const tool of await listTools()) {
      const spec = SPEC[tool.name]!;
      expect(tool.description, tool.name).toBe(spec.description);
      expect(tool.annotations, tool.name).toEqual(spec.annotations);
    }
  });

  it('requires exactly the spec arguments and rejects unknown ones', async () => {
    for (const tool of await listTools()) {
      expect([...(tool.inputSchema.required ?? [])].sort(), tool.name).toEqual(
        [...SPEC[tool.name]!.required].sort(),
      );
      if (Object.keys(tool.inputSchema.properties ?? {}).length > 0) {
        expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      }
    }
  });

  it('gives every input field a non-empty description and a flat primitive type', async () => {
    for (const tool of await listTools()) {
      const props = (tool.inputSchema.properties ?? {}) as Record<string, Prop>;
      for (const [field, schema] of Object.entries(props)) {
        const where = `${tool.name}.${field}`;
        expect(typeof schema.description, where).toBe('string');
        expect((schema.description as string).trim().length, where).toBeGreaterThan(0);
        expect(['string', 'integer', 'number', 'boolean'], where).toContain(schema.type);
      }
    }
  });

  it('sets bounds, defaults and formats as in the spec', async () => {
    const byName = Object.fromEntries((await listTools()).map((t) => [t.name, t]));
    const props = (name: string) => byName[name]!.inputSchema.properties as Record<string, Prop>;

    expect(props('get_conventions').limit).toMatchObject({ type: 'integer', minimum: 1, maximum: 100, default: 50 });
    expect(props('get_conventions').includePending).toMatchObject({ type: 'boolean', default: false });
    expect(props('get_findings').limit).toMatchObject({ type: 'integer', minimum: 1, maximum: 50, default: 20 });
    expect(props('get_findings').run_id).toMatchObject({ type: 'string', format: 'uuid' });
    expect(props('run_agent_on_pr').agent).toMatchObject({ type: 'string', format: 'uuid' });
    for (const name of ['get_findings', 'run_agent_on_pr', 'get_blast_radius']) {
      expect(props(name).pr, name).toMatchObject({ type: 'integer', exclusiveMinimum: 0 });
    }
    for (const name of ['get_conventions', 'get_findings', 'run_agent_on_pr', 'get_blast_radius']) {
      // "owner/name" only: no URL or path fragment can come in through `repo`.
      const re = new RegExp(props(name).repo!.pattern as string);
      expect(re.test('acme/api'), name).toBe(true);
      expect(re.test('../etc/passwd'), name).toBe(false);
      expect(re.test('https://x/y/z'), name).toBe(false);
    }
  });
});
