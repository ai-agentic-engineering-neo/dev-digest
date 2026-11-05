import { describe, it, expect, beforeEach } from 'vitest';
import type { ConventionCandidate, ConventionStatus, FeatureModelChoice, Skill } from '@devdigest/shared';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { GroundedConvention } from '../src/modules/conventions/domain.js';
import type { ConventionPatch, ConventionsRepositoryPort } from '../src/modules/conventions/ports.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';

/** In-memory ConventionsRepositoryPort — service rules without Docker. */
class FakeConventionsRepo implements ConventionsRepositoryPort {
  rows: (ConventionCandidate & { ws: string; repoId: string })[] = [];
  override?: FeatureModelChoice;
  private seq = 0;
  async getRepo(ws: string, repoId: string) {
    return ws === 'ws' && repoId === 'r1'
      ? { id: 'r1', owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api', cloned: true }
      : undefined;
  }
  async list(ws: string, repoId: string) {
    return this.rows.filter((r) => r.ws === ws && r.repoId === repoId);
  }
  async acceptedRules(ws: string, repoId: string) {
    return (await this.list(ws, repoId)).filter((r) => r.status === 'accepted').map((r) => r.rule);
  }
  async replaceUnaccepted(ws: string, repoId: string, items: GroundedConvention[]) {
    this.rows = this.rows.filter((r) => !(r.ws === ws && r.repoId === repoId && r.status !== 'accepted'));
    for (const c of items) {
      this.rows.push({
        ws,
        repoId,
        id: `c${++this.seq}`,
        category: c.category,
        rule: c.rule,
        evidence_path: c.evidencePath,
        evidence_snippet: c.evidenceSnippet,
        line_start: c.lineStart,
        line_end: c.lineEnd,
        confidence: c.confidence,
        status: 'pending',
      });
    }
  }
  async update(ws: string, id: string, patch: ConventionPatch) {
    const row = this.rows.find((r) => r.ws === ws && r.id === id);
    if (!row) return undefined;
    if (patch.status) row.status = patch.status;
    if (patch.rule) row.rule = patch.rule;
    return row;
  }
  async setAllStatus(ws: string, repoId: string, status: ConventionStatus) {
    for (const r of await this.list(ws, repoId)) r.status = status;
  }
  async featureModelOverride() {
    return this.override;
  }
}

const FILES = {
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/api/users.ts': 'export async function getUser(id) {\n  const user = await db.users.find(id);\n  return user;\n}\n',
  'src/lib/redis.ts': 'export const redis = new Redis(config.redisUrl);\n',
};

const EXTRACTION = {
  candidates: [
    {
      category: 'async',
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);',
      confidence: 0.91,
    },
    {
      category: 'structure',
      rule: 'Redis access goes through src/lib/redis.ts singleton',
      evidence_path: 'src/lib/redis.ts',
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.85,
    },
    // hallucinated code in a real file → dropped
    {
      category: 'errors',
      rule: 'Handlers return Result<T, ApiError>',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'function handler(): Result<Item[], ApiError> {',
      confidence: 0.78,
    },
    // file that does not exist → dropped
    {
      category: 'naming',
      rule: 'Files are kebab-case',
      evidence_path: 'src/ghost.ts',
      evidence_snippet: 'export const ghost = true;',
      confidence: 0.6,
    },
  ],
};

describe('ConventionsService', () => {
  let repo: FakeConventionsRepo;
  let llm: MockLLMProvider;
  let skills: Skill[];
  let links: { agentId: string; skillId: string; order: number }[];
  let service: ConventionsService;

  beforeEach(() => {
    repo = new FakeConventionsRepo();
    llm = new MockLLMProvider('openai', { structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: EXTRACTION } });
    skills = [];
    links = [];
    const deps = {
      conventionsRepo: repo,
      git: new MockGitClient({ files: FILES }),
      repoIntel: { getConventionSamples: async () => ['src/api/users.ts', 'src/lib/redis.ts'] },
      llm: async () => llm,
      skillsRepo: {
        getByName: async (_ws: string, name: string) => skills.find((s) => s.name === name),
        insert: async (
          v: Omit<Skill, 'id' | 'version'> & { evidenceFiles?: string[] | null; linkAgentId?: string | null },
        ) => {
          const { linkAgentId, ...rest } = v;
          const s = { ...rest, id: `s${skills.length + 1}`, version: 1, enabled: v.enabled ?? true } as Skill;
          skills.push(s);
          if (linkAgentId) {
            links.push({ agentId: linkAgentId, skillId: s.id, order: links.filter((l) => l.agentId === linkAgentId).length });
          }
          return s;
        },
      },
      agentsRepo: {
        getById: async (_ws: string, id: string) => (id === 'agent-1' ? { id } : undefined),
        linkedSkills: async (agentId: string) => links.filter((l) => l.agentId === agentId),
        linkSkill: async (agentId: string, skillId: string, order: number) => {
          links.push({ agentId, skillId, order });
        },
      },
    };
    service = new ConventionsService(deps as unknown as ConstructorParameters<typeof ConventionsService>[0]);
  });

  it('samples configs + top files by code, calls the cheap default model once, keeps only grounded candidates', async () => {
    const res = await service.extract('ws', 'r1');
    expect(res.sampled_files).toEqual(['tsconfig.json', 'src/api/users.ts', 'src/lib/redis.ts']);
    expect(res.rejected_ungrounded).toBe(2);
    expect(res.candidates.map((c) => [c.rule, c.line_start, c.status])).toEqual([
      ['Always use async/await instead of .then() chains', 2, 'pending'],
      ['Redis access goes through src/lib/redis.ts singleton', 1, 'pending'],
    ]);
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { model: string; maxTokens: number; messages: { content: string }[] };
    expect(req.model).toBe('gpt-4.1-mini');
    expect(req.maxTokens).toBe(4000); // bounded: an uncapped request is refused on low credit limits
    expect(req.messages[1]!.content).toContain('<untrusted source="repository">');
  });

  it('uses the workspace feature-model override when set', async () => {
    repo.override = { provider: 'openai', model: 'gpt-4.1' };
    await service.extract('ws', 'r1');
    expect((llm.calls.at(-1)!.req as { model: string }).model).toBe('gpt-4.1');
  });

  it('re-scan keeps accepted candidates and does not re-add them', async () => {
    const first = await service.extract('ws', 'r1');
    await service.update('ws', first.candidates[0]!.id, { status: 'accepted' });
    await service.update('ws', first.candidates[1]!.id, { status: 'rejected' });
    const second = await service.extract('ws', 'r1');
    expect(second.candidates.map((c) => c.status).sort()).toEqual(['accepted', 'pending']);
    expect(second.candidates).toHaveLength(2);
  });

  it('edits a rule; empty text and unknown ids are rejected', async () => {
    const { candidates } = await service.extract('ws', 'r1');
    const edited = await service.update('ws', candidates[0]!.id, { rule: '  Use await, never .then()  ' });
    expect(edited.rule).toBe('Use await, never .then()');
    await expect(service.update('ws', candidates[0]!.id, { rule: '  ' })).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.update('ws', 'nope', { status: 'accepted' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('unknown repo → 404', async () => {
    await expect(service.extract('ws', 'other')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.extract('other-ws', 'r1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('skill draft needs accepted conventions; saving creates a trusted extracted skill linked to the agent', async () => {
    const { candidates } = await service.extract('ws', 'r1');
    await expect(service.skillDraft('ws', 'r1')).rejects.toMatchObject({ statusCode: 422 });
    await service.setAll('ws', 'r1', 'accepted');

    const draft = await service.skillDraft('ws', 'r1');
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.convention_ids).toEqual(candidates.map((c) => c.id));

    links.push({ agentId: 'agent-1', skillId: 'existing', order: 0 });
    const res = await service.createSkill('ws', 'r1', { ...draft, body: draft.body + '\nEdited.', agent_id: 'agent-1' });
    expect(res.skill).toMatchObject({ name: 'payments-api-conventions', source: 'extracted', type: 'convention' });
    expect(res.skill.body).toContain('Edited.');
    expect(res.linked_agent_id).toBe('agent-1');
    expect(links.at(-1)).toEqual({ agentId: 'agent-1', skillId: res.skill.id, order: 1 });

    await expect(service.createSkill('ws', 'r1', draft)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.createSkill('ws', 'r1', { ...draft, name: 'Bad Name' })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(
      service.createSkill('ws', 'r1', { ...draft, name: 'other-name', agent_id: 'agent-x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
