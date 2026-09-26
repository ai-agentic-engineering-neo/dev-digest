/**
 * platform/logger-options.ts — cross-cutting runtime machinery (Fastify's
 * pino logger config), not a ring. Pure: takes AppConfig, returns the
 * `logger` constructor option. No I/O.
 */
import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config.js';

/**
 * Fields redacted wherever they appear in a logged object (top-level and one
 * level deep — pino's `*.key` wildcard does not recurse further), plus the
 * two Fastify request headers that routinely carry secrets. Security §A09 —
 * never log passwords/secrets/tokens/API keys/authorization.
 */
export const REDACT_PATHS: string[] = [
  'password',
  '*.password',
  'secret',
  '*.secret',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'authorization',
  '*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
];

/**
 * Fastify's `logger` constructor option: `false` when `logLevel === 'silent'`
 * (tests), otherwise the pino-pretty-in-dev config that used to be inlined in
 * `app.ts`, plus the redact list above.
 */
export function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.logLevel === 'silent') return false;
  return {
    level: config.logLevel,
    transport:
      config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
}
