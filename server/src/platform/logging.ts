import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config.js';

/**
 * Pino options for the Fastify logger (composition root). Secrets must never
 * reach the log: auth headers, cookies and any credential-looking key up to
 * three levels deep (`{ apiKey }`, `{ body: { key } }`, `{ req: { body: { token } } }`).
 * Pino redact paths do not recurse — add a level here if a deeper shape is logged.
 * Log errors as `{ err }` (pino's err serializer keeps type, message and stack),
 * never `{ err: err.message }`.
 */
const SECRET_KEYS = ['apiKey', 'api_key', 'key', 'token', 'secret', 'password', 'authorization'];

export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

export function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.logLevel === 'silent') return false;
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    transport:
      config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  };
}
