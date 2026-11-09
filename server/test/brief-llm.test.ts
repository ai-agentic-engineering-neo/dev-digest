import { describe, it, expect } from 'vitest';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { ConfigError } from '../src/platform/errors.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { Db } from '../src/db/client.js';

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const withKeys = () =>
  new Container(config(), {} as Db, {
    secrets: new MockSecretsProvider({ OPENROUTER_API_KEY: 'k', OPENAI_API_KEY: 'k' }),
  });

/** Reads the private OpenAI SDK client of an OpenRouterProvider. */
function sdkOptions(p: unknown): { timeout: number; maxRetries: number } {
  const client = (p as { client: { timeout: number; maxRetries: number } }).client;
  return { timeout: client.timeout, maxRetries: client.maxRetries };
}

describe('Container.briefLlm', () => {
  it('builds OpenRouter with 60 s and 0 transport retries, llm() keeps the defaults', async () => {
    const c = withKeys();
    const brief = await c.briefLlm('openrouter');
    expect(brief).toBeInstanceOf(OpenRouterProvider);
    expect(sdkOptions(brief)).toEqual({ timeout: 60_000, maxRetries: 0 });
    expect(await c.briefLlm('openrouter')).toBe(brief); // cached
    const plain = await c.llm('openrouter');
    expect(sdkOptions(plain)).toEqual({ timeout: 90_000, maxRetries: 2 });
  });

  it('builds an OpenAI provider like llm()', async () => {
    const p = await withKeys().briefLlm('openai');
    expect(p.id).toBe('openai');
  });

  it('returns an injected provider as is', async () => {
    const mock = new MockLLMProvider('openai');
    const c = new Container(config(), {} as Db, { llm: { openrouter: mock } });
    expect(await c.briefLlm('openrouter')).toBe(mock);
  });

  it('throws ConfigError without a key', async () => {
    const c = new Container(config(), {} as Db, { secrets: new MockSecretsProvider() });
    await expect(c.briefLlm('openrouter')).rejects.toBeInstanceOf(ConfigError);
  });

  it('invalidateSecretCaches drops the brief provider', async () => {
    const c = withKeys();
    const a = await c.briefLlm('openrouter');
    c.invalidateSecretCaches();
    expect(await c.briefLlm('openrouter')).not.toBe(a);
  });
});
