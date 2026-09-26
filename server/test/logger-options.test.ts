/**
 * L03 — `loggerOptions` (platform/logger-options.ts): the pino config Fastify
 * is built with, incl. the `redact` list (security §A09 — never log
 * passwords/secrets/tokens/API keys/authorization).
 */
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { loggerOptions } from '../src/platform/logger-options.js';
import { loadConfig } from '../src/platform/config.js';

describe('loggerOptions', () => {
  it('returns false when logLevel is "silent" (the test-suite default)', () => {
    const cfg = loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(cfg.logLevel).toBe('silent');
    expect(loggerOptions(cfg)).toBe(false);
  });

  it('redacts apiKey/token values (top-level and one level deep) and never logs the raw secret', async () => {
    const cfg = loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'info' } as NodeJS.ProcessEnv);
    const opts = loggerOptions(cfg);
    if (opts === false) throw new Error('expected a logger config for logLevel=info');

    const lines: string[] = [];
    const app = Fastify({
      logger: {
        ...opts,
        stream: { write: (msg: string) => { lines.push(msg); } },
      },
    });

    app.log.info({ apiKey: 'sk-CANARY-1', nested: { token: 'tok-CANARY-2' } }, 'x');
    await app.close();

    const output = lines.join('');
    expect(output).not.toContain('sk-CANARY-1');
    expect(output).not.toContain('tok-CANARY-2');
    expect((output.match(/\[REDACTED\]/g) ?? []).length).toBe(2);
  });
});
