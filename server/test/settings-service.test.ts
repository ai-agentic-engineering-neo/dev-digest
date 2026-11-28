/**
 * SettingsService.testConnection against in-memory ports (S11): a candidate
 * key is verified with a throwaway client first and saved only if it works.
 */
import { describe, it, expect } from 'vitest';
import { Settings } from '@devdigest/shared';
import { SettingsService } from '../src/modules/settings/service.js';
import type { ProviderClients, SecretVault } from '../src/modules/settings/ports.js';

function setup(opts: { llmFails?: string } = {}) {
  const saved: Record<string, string> = {};
  let forgotten = 0;
  const secrets: SecretVault = {
    get: async (key) => saved[key],
    set: async (key, value) => {
      saved[key] = value;
    },
  };
  const clients: ProviderClients = {
    github: async () => ({ currentLogin: async () => 'octocat' }),
    llm: async () => ({
      listModels: async () => {
        if (opts.llmFails) throw new Error(opts.llmFails);
        return [];
      },
    }),
    forgetCached: () => {
      forgotten += 1;
    },
  };
  const service = new SettingsService({
    settings: { get: async () => Settings.parse({}), put: async () => {} },
    secrets,
    clients,
  });
  return { service, saved, forgotten: () => forgotten };
}

describe('SettingsService.testConnection', () => {
  it('saves a candidate key only after it verified, then drops cached clients', async () => {
    const { service, saved, forgotten } = setup();

    const res = await service.testConnection('openai', 'sk-good');

    expect(res).toEqual({ provider: 'openai', ok: true, message: 'OK — 0 models available' });
    expect(saved).toEqual({ OPENAI_API_KEY: 'sk-good' });
    expect(forgotten()).toBe(1);
  });

  it('does not save a key that failed, and redacts it from the error', async () => {
    const { service, saved, forgotten } = setup({ llmFails: 'bad key sk-typo rejected' });

    const res = await service.testConnection('openai', 'sk-typo');

    expect(res.ok).toBe(false);
    expect(res.message).toBe('bad key [redacted] rejected — key not saved');
    expect(saved).toEqual({});
    expect(forgotten()).toBe(0);
  });

  it('tests the stored GitHub token without writing anything', async () => {
    const { service, saved } = setup();
    expect(await service.testConnection('github')).toEqual({
      provider: 'github',
      ok: true,
      message: 'Connected as @octocat',
    });
    expect(saved).toEqual({});
  });
});
