import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import {
  validatorCompiler,
  serializerCompiler,
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { loadConfig, type AppConfig } from './platform/config.js';
import { createDb, type Db } from './db/client.js';
import { Container, type ContainerOverrides } from './platform/container.js';
import { AppError } from './platform/errors.js';
import { isAllowedHost, isAllowedOrigin } from './platform/local-only.js';
import { modules } from './modules/index.js';

// Attach the DI container to every request/instance.
declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;
}

/** Stable envelope code for a framework-raised 4xx (no AppError). */
function frameworkErrorCode(status: number, fastifyCode?: string): string {
  if (fastifyCode?.includes('JSON')) return 'invalid_json';
  if (status === 413) return 'payload_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  return 'bad_request';
}

/**
 * buildApp() — exported so tests can use `app.inject()` without a real port.
 * Wires the zod type provider (request validation + response serialization),
 * the security/transport plugins (helmet, cors, rate-limit, SSE) ahead of the
 * DI container and the statically-registered feature modules, plus a structured
 * error handler returning the ApiErrorBody envelope.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const handle = opts.db ? null : createDb(config.databaseUrl);
  const db = opts.db ?? handle!.db;

  const app = Fastify({
    // Explicit 1MB cap on request bodies (PR comments, settings payloads are
    // small). Protects against oversized/abusive payloads.
    bodyLimit: 1_048_576,
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            transport:
              config.nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
          },
  });

  // Use zod schemas directly for request validation + response serialization.
  // Routes opt in per-module via `app.withTypeProvider<ZodTypeProvider>()`.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const container = new Container(config, db, opts.overrides);
  container.jobs.setLogger(app.log);
  app.decorate('container', container);

  // Security headers (X-Content-Type-Options, X-Frame-Options, …). The API
  // serves JSON only, so the default CSP is fine.
  // S2 — DNS-rebinding / cross-site guard for an unauthenticated local API.
  // Runs first on every request (including /health and CORS preflights).
  app.addHook('onRequest', async (req, reply) => {
    if (!isAllowedHost(req.headers.host, config.allowedHosts)) {
      return reply.status(403).send({
        error: { code: 'forbidden_host', message: 'Host not allowed (see API_ALLOWED_HOSTS)' },
      });
    }
    if (!isAllowedOrigin(req.headers.origin, config.allowedOrigins)) {
      return reply.status(403).send({ error: { code: 'forbidden_origin', message: 'Origin not allowed' } });
    }
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.allowedOrigins, credentials: true });
  await app.register(FastifySSEPlugin);

  // Global rate limit. Disabled under test so integration suites can hammer
  // endpoints via inject(); per-route overrides live on the routes themselves.
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  // Liveness check (no module, no DB, no rate limit).
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // Readiness check — verifies the DB is reachable with a cheap `SELECT 1`.
  // 503 (not 500) so orchestrators treat it as "not ready yet", not a crash.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ready: true };
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'readiness check failed: db unreachable');
      return reply.status(503).send({ ready: false });
    }
  });

  // Structured error handler. Registered BEFORE modules so encapsulated
  // module plugins inherit it. Validation → 422; AppError → its status.
  app.setErrorHandler((err: unknown, req, reply) => {
    // Request validation failure from the zod type provider (schema.body/params).
    if (hasZodFastifySchemaValidationErrors(err)) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.validation,
        },
      });
      return;
    }
    // Response failed its own serialization schema — never leak the raw object;
    // log it and return a generic 500.
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response serialization failed');
      reply.status(500).send({ error: { code: 'internal_error', message: 'Internal error' } });
      return;
    }
    // Robust ZodError detection: `instanceof` can fail across duplicate zod
    // module instances (shared vs api), so also match by shape. Still needed for
    // service-level `.parse` calls and routes not yet on schema.body.
    const maybeZod = err as { name?: string; issues?: unknown; errors?: unknown };
    const isZodError =
      err instanceof z.ZodError ||
      (maybeZod?.name === 'ZodError' &&
        (Array.isArray(maybeZod.issues) || Array.isArray(maybeZod.errors)));
    if (isZodError) {
      reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: maybeZod.issues ?? maybeZod.errors,
        },
      });
      return;
    }
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    // Framework 4xx (malformed JSON, 413, 429, …): the message is safe to show;
    // give each a stable code instead of "internal_error".
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      req.log.warn({ err }, 'request rejected');
      reply.status(e.statusCode).send({
        error: { code: frameworkErrorCode(e.statusCode, e.code), message: e.message ?? 'Bad request' },
      });
      return;
    }
    // Everything else is a 5xx. The detail stays in the log (with the request
    // id); the client gets a generic message outside development.
    req.log.error({ err }, 'unhandled error');
    reply.status(typeof e.statusCode === 'number' ? e.statusCode : 500).send({
      error: {
        code: 'internal_error',
        message: config.nodeEnv === 'development' ? (e.message ?? 'Internal error') : 'Internal error',
      },
    });
  });

  // Unknown routes return the same envelope as every other failure.
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `Route ${req.method} ${req.url} not found` },
    });
  });

  // Register feature modules from the static registry (src/modules/index.ts).
  // Each module is a Fastify plugin in modules/<name>/routes.ts.
  for (const plugin of Object.values(modules)) {
    await app.register(plugin);
  }

  // Close the db handle we created on shutdown.
  if (handle) app.addHook('onClose', async () => handle.close());

  return app;
}
