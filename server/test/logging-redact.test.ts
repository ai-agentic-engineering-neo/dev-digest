import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { loadConfig } from '../src/platform/config.js';
import { loggerOptions } from '../src/platform/logging.js';

/** Secrets never reach the log: headers + credential-looking keys are redacted. */
describe('logger redaction', () => {
  it('censors auth headers and secret keys at any logged depth up to 3', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'info' } as NodeJS.ProcessEnv);
    const opts = loggerOptions(config);
    expect(opts).toBeTypeOf('object');
    const app = Fastify({ logger: { ...(opts as object), stream } });
    app.log.info(
      {
        apiKey: 'sk-top',
        req: { headers: { authorization: 'Bearer sk-hdr', cookie: 'sid=1' } },
        body: { key: 'sk-body', provider: 'openai' },
        settings: { nested: { token: 'ghp_deep' } },
      },
      'probe',
    );
    await app.close();
    const out = lines.join('');
    for (const secret of ['sk-top', 'sk-hdr', 'sid=1', 'sk-body', 'ghp_deep']) expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('openai');
  });

  it('censors a raw `messages` array (defense in depth for accidentally-logged prompt content)', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'info' } as NodeJS.ProcessEnv);
    const opts = loggerOptions(config);
    const app = Fastify({ logger: { ...(opts as object), stream } });
    app.log.info(
      { messages: [{ role: 'user', content: 'SENTINEL_PROMPT_CONTENT' }], req: { body: { messages: [{ content: 'NESTED_SENTINEL' }] } } },
      'probe',
    );
    await app.close();
    const out = lines.join('');
    expect(out).not.toContain('SENTINEL_PROMPT_CONTENT');
    expect(out).not.toContain('NESTED_SENTINEL');
    expect(out).toContain('[REDACTED]');
  });

  it('is disabled when LOG_LEVEL is silent', () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
    expect(loggerOptions(config)).toBe(false);
  });
});
