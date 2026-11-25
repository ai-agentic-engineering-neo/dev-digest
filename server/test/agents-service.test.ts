import { describe, it, expect } from 'vitest';
import { AgentsService, type AgentsStore } from '../src/modules/agents/service.js';

// Application layer built with explicit fakes — no Postgres, no Container (onion §10/§12).
const noStore = {} as AgentsStore;

describe('AgentsService.listModels', () => {
  it('returns the provider adapter model list', async () => {
    const svc = new AgentsService({
      repo: noStore,
      llm: async (provider) => ({ listModels: async () => [{ id: `${provider}-m1`, provider }] }),
    });
    expect(await svc.listModels('openai')).toEqual([{ id: 'openai-m1', provider: 'openai' }]);
  });

  it('degrades to [] when the provider key is missing (adapter throws)', async () => {
    const svc = new AgentsService({
      repo: noStore,
      llm: async () => {
        throw new Error('OPENAI_API_KEY not set');
      },
    });
    expect(await svc.listModels('openai')).toEqual([]);
  });
});
