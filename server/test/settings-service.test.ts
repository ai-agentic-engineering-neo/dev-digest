/**
 * SettingsService (application ring) with in-memory fakes — no DB, no Fastify.
 */
import { describe, it, expect } from 'vitest';
import type { SecretsProvider } from '@devdigest/shared';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { SettingsService } from '../src/modules/settings/service.js';
import type { SettingsRow } from '../src/modules/settings/helpers.js';

class FakeSettings {
  rows = new Map<string, SettingsRow[]>();
  upsertCalls = 0;
  async listForWorkspace(ws: string) {
    return this.rows.get(ws) ?? [];
  }
  async upsertMany(ws: string, _userId: string, entries: SettingsRow[]) {
    if (entries.length === 0) return;
    this.upsertCalls++;
    const current = new Map((this.rows.get(ws) ?? []).map((r) => [r.key, r.value]));
    for (const e of entries) current.set(e.key, e.value);
    this.rows.set(ws, [...current].map(([key, value]) => ({ key, value })));
  }
}

function build(secrets: SecretsProvider = { get: async () => undefined }) {
  const store = new FakeSettings();
  let invalidated = 0;
  const svc = new SettingsService({
    settings: store,
    secrets,
    github: async () => new MockGitHubClient({ login: 'octocat' }),
    llm: async () => new MockLLMProvider(),
    invalidateSecretCaches: () => void invalidated++,
  });
  return { svc, store, invalidated: () => invalidated };
}

describe('SettingsService', () => {
  it('update writes every key in ONE upsert and returns the merged bag', async () => {
    const { svc, store } = build();
    await svc.update('ws', 'u', { theme: 'light' });
    const out = await svc.update('ws', 'u', { density: 'compact', polling_interval_min: 10 });
    expect(out).toEqual({ theme: 'light', density: 'compact', polling_interval_min: 10 });
    expect(store.upsertCalls).toBe(2);
  });

  it('resolveFeatureModel: registry default until overridden; invalid overrides are ignored', async () => {
    const { svc, store } = build();
    expect(await svc.getFeatureModelOverride('ws', 'onboarding')).toBeUndefined();
    expect(await svc.resolveFeatureModel('ws', 'risk_brief')).toEqual({ provider: 'openai', model: 'gpt-4.1' });

    store.rows.set('ws', [
      { key: 'feature_models', value: { risk_brief: { provider: 'anthropic', model: 'claude-x' }, onboarding: { model: '' } } },
    ]);
    expect(await svc.resolveFeatureModel('ws', 'risk_brief')).toEqual({ provider: 'anthropic', model: 'claude-x' });
    expect(await svc.getFeatureModelOverride('ws', 'onboarding')).toBeUndefined();
  });

  it('secretsStatus returns booleans only', async () => {
    const { svc } = build({ get: async (k) => (k === 'GITHUB_TOKEN' ? 'ghp_secret' : undefined) });
    expect(await svc.secretsStatus()).toEqual({ openai: false, anthropic: false, openrouter: false, github: true });
  });

  it('testConnection persists a supplied key, drops cached clients, then tests', async () => {
    const saved: Array<[string, string]> = [];
    const { svc, invalidated } = build({ get: async () => undefined, set: async (k, v) => void saved.push([k, v]) });
    const res = await svc.testConnection('github', 'ghp_new');
    expect(res).toEqual({ provider: 'github', ok: true, message: 'Connected as @octocat' });
    expect(saved).toEqual([['GITHUB_TOKEN', 'ghp_new']]);
    expect(invalidated()).toBe(1);
  });

  it('testConnection reports a read-only secrets backend instead of throwing', async () => {
    const { svc } = build();
    expect(await svc.testConnection('openai', 'sk-x')).toEqual({
      provider: 'openai',
      ok: false,
      message: 'Secrets backend is read-only',
    });
  });
});
