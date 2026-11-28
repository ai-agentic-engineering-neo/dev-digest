import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig secretsPath', () => {
  it('defaults to ~/.devdigest/secrets.json', () => {
    expect(loadConfig({}).secretsPath).toBe(join(homedir(), '.devdigest', 'secrets.json'));
  });

  it('honours DEVDIGEST_SECRETS_PATH, and an empty value falls back to the default', () => {
    expect(loadConfig({ DEVDIGEST_SECRETS_PATH: '/tmp/empty-secrets' }).secretsPath).toBe(
      '/tmp/empty-secrets',
    );
    expect(loadConfig({ DEVDIGEST_SECRETS_PATH: '' }).secretsPath).toBe(
      join(homedir(), '.devdigest', 'secrets.json'),
    );
  });
});
