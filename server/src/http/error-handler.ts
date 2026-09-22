import type { FastifyError, FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, type ErrorKind } from '../platform/errors.js';

/**
 * HTTP edge for errors — the ONLY place that knows HTTP statuses for domain /
 * application errors. Every response uses the ApiErrorBody envelope the client
 * parses (client/src/lib/api.ts → ApiError):
 *
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * Mapping:
 *   request validation (zod type provider)  → 422 validation_error
 *   response serialization failure          → 500 internal_error (logged)
 *   AppError                                → STATUS_BY_KIND[kind] (legacy statusCode wins)
 *   any other ZodError (LLM/DB/trace parse)  → 500 internal_error (logged) — NOT a client error
 *   other Fastify/plugin 4xx (bad JSON, 413) → its status + message
 *   anything else                           → 500 internal_error, raw message never echoed
 *   unknown route                           → 404 not_found
 */
export const STATUS_BY_KIND: Readonly<Record<ErrorKind, number>> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  internal: 500,
  config: 500,
  external_service: 502,
};

/** HTTP status for an AppError: legacy explicit status first, else the kind table. */
export function statusForAppError(err: AppError): number {
  return err.statusCode ?? STATUS_BY_KIND[err.kind] ?? 500;
}

/** Match ZodError by shape too: `instanceof` fails across duplicate zod copies (vendored shared vs api). */
function isZodError(err: unknown): err is { issues: unknown } {
  if (err instanceof z.ZodError) return true;
  const e = err as { name?: string; issues?: unknown } | null;
  return e?.name === 'ZodError' && Array.isArray(e.issues);
}

const INTERNAL = { error: { code: 'internal_error', message: 'Internal error' } } as const;

/**
 * Register the root error + not-found handlers. Call BEFORE registering the
 * feature modules so their encapsulated contexts inherit the handler.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req, reply) => {
    // Request validation (schema params/querystring/body) from the zod type
    // provider — the only ZodError-derived failure that is the client's fault.
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(422).send({
        error: { code: 'validation_error', message: 'Request validation failed', details: err.validation },
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response serialization failed');
      return reply.status(500).send(INTERNAL);
    }
    if (err instanceof AppError) {
      const status = statusForAppError(err);
      if (status >= 500) req.log.error({ err }, 'request failed');
      return reply.status(status).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    // A ZodError that is not request validation comes from parsing OUR data
    // (LLM output, a stored trace, a DB JSON column) — a server bug, not 422.
    if (isZodError(err)) {
      req.log.error({ err }, 'internal data failed schema validation');
      return reply.status(500).send(INTERNAL);
    }
    // Fastify/plugin errors: 4xx (bad JSON, 413, 415, rate limit…) keep their
    // message; 5xx never echoes the raw message (driver/SQL/upstream text can
    // carry internals) — the full error goes to the log only.
    const e = err as Partial<FastifyError>;
    const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    if (status < 500) {
      return reply.status(status).send({
        error: { code: 'internal_error', message: e.message ?? 'Bad request' },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(status).send(INTERNAL);
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `Route ${req.method} ${req.url.split('?')[0]} not found` },
    });
  });
}
