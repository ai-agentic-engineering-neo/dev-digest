import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import type { SecretsProvider } from '../src/domain/ports/secrets.js';
import type { LLMProvider } from '../src/domain/ports/llm.js';
import type { GitHubClient } from '../src/domain/ports/github.js';

/** S11 (security hardening) — a failed check must not overwrite the saved key. */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function fakeSecrets() {
  const store = new Map<string, string>([['OPENAI_API_KEY', 'sk-working']]);
  const secrets = {
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  } as unknown as SecretsProvider & { set: ReturnType<typeof vi.fn> };
  return { store, secrets };
}

function llm(listModels: () => Promise<unknown[]>): LLMProvider {
  return { listModels } as unknown as LLMProvider;
}

async function post(app: Awaited<ReturnType<typeof buildApp>>, payload: object) {
  const res = await app.inject({ method: 'POST', url: '/settings/test-connection', payload });
  expect(res.statusCode).toBe(200);
  return res.json() as { ok: boolean; message: string };
}

describe('POST /settings/test-connection', () => {
  it('does not persist a key that fails the check, and never echoes it', async () => {
    const { store, secrets } = fakeSecrets();
    const app = await buildApp({
      config,
      overrides: {
        secrets,
        llm: { openai: llm(async () => Promise.reject(new Error('401 Incorrect API key: sk-typo'))) },
      },
    });
    const body = await post(app, { provider: 'openai', key: 'sk-typo' });
    expect(body.ok).toBe(false);
    expect(body.message).not.toContain('sk-typo');
    expect(body.message).toContain('key not saved');
    expect(secrets.set).not.toHaveBeenCalled();
    expect(store.get('OPENAI_API_KEY')).toBe('sk-working');
    await app.close();
  });

  it('persists the key only after a successful check', async () => {
    const { store, secrets } = fakeSecrets();
    const app = await buildApp({
      config,
      overrides: { secrets, llm: { openai: llm(async () => [{ id: 'gpt' }]) } },
    });
    const body = await post(app, { provider: 'openai', key: 'sk-new' });
    expect(body.ok).toBe(true);
    expect(secrets.set).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-new');
    expect(store.get('OPENAI_API_KEY')).toBe('sk-new');
    await app.close();
  });

  it('same for a GitHub token', async () => {
    const { secrets } = fakeSecrets();
    const github = {
      currentLogin: async () => {
        throw new Error('Bad credentials');
      },
    } as unknown as GitHubClient;
    const app = await buildApp({ config, overrides: { secrets, github } });
    const body = await post(app, { provider: 'github', key: 'ghp_typo' });
    expect(body.ok).toBe(false);
    expect(secrets.set).not.toHaveBeenCalled();
    await app.close();
  });
});
