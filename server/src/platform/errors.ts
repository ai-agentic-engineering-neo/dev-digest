/**
 * Domain / application error taxonomy. Inner rings throw these; they carry NO
 * HTTP knowledge. The http edge (`src/http/error-handler.ts`) owns the single
 * `kind → HTTP status` table and renders the stable envelope
 * (ApiErrorBody): `{ error: { code, message, details } }`.
 *
 * - `kind`    — the error category; decides the HTTP status at the edge.
 * - `code`    — the stable machine-readable wire code (defaults to the kind's
 *               canonical code; override for a more specific one, e.g.
 *               `new InvalidInputError('Provide agentId or all:true', undefined, 'invalid_run_request')`).
 * - `message` — human text, sent to the client as-is (never put secrets/SQL in it).
 * - `details` — optional structured payload, sent to the client.
 *
 * Add a new category = add a `kind` + a subclass here AND a row in the status
 * table (the `Record<ErrorKind, number>` type makes a missing row a compile error).
 */

export type ErrorKind =
  | 'invalid_input'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'config'
  | 'external_service'
  | 'internal';

export class AppError extends Error {
  /** Category; mapped to an HTTP status by the http edge. Legacy default: invalid_input (400). */
  readonly kind: ErrorKind = 'invalid_input';

  /**
   * @deprecated HTTP detail leaking into an inner ring. Only legacy call sites
   * (`new AppError(code, message, status)`) set it, and the edge honours it over
   * the kind table. New code throws a subclass (NotFoundError, InvalidInputError…)
   * and never passes a status.
   */
  readonly statusCode?: number;

  /**
   * @deprecated for direct use with a status — throw a subclass instead.
   * Still valid as `new AppError(code, message)` (→ invalid_input / 400).
   */
  constructor(
    public readonly code: string,
    message: string,
    statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    if (statusCode !== undefined) this.statusCode = statusCode;
  }
}

/** Input is well-formed but not acceptable for this operation (→ 400). */
export class InvalidInputError extends AppError {
  override readonly kind = 'invalid_input';
  constructor(message = 'Invalid input', details?: unknown, code = 'invalid_input') {
    super(code, message, undefined, details);
  }
}

/** A domain invariant / schema validation failed (→ 422, like request validation). */
export class ValidationError extends AppError {
  override readonly kind = 'validation';
  constructor(message = 'Validation failed', details?: unknown, code = 'validation_error') {
    super(code, message, undefined, details);
  }
}

export class UnauthorizedError extends AppError {
  override readonly kind = 'unauthorized';
  constructor(message = 'Authentication required', details?: unknown, code = 'unauthorized') {
    super(code, message, undefined, details);
  }
}

export class ForbiddenError extends AppError {
  override readonly kind = 'forbidden';
  constructor(message = 'Forbidden', details?: unknown, code = 'forbidden') {
    super(code, message, undefined, details);
  }
}

export class NotFoundError extends AppError {
  override readonly kind = 'not_found';
  constructor(message = 'Not found', details?: unknown, code = 'not_found') {
    super(code, message, undefined, details);
  }
}

/** State conflict: duplicate, stale version, illegal state transition (→ 409). */
export class ConflictError extends AppError {
  override readonly kind = 'conflict';
  constructor(message = 'Conflict', details?: unknown, code = 'conflict') {
    super(code, message, undefined, details);
  }
}

/** Missing/invalid configuration or secret (e.g. an API key not set) (→ 500). */
export class ConfigError extends AppError {
  override readonly kind = 'config';
  constructor(message: string, details?: unknown, code = 'config_error') {
    super(code, message, undefined, details);
  }
}

/** An upstream (LLM, GitHub, git) failed or returned unusable data (→ 502). */
export class ExternalServiceError extends AppError {
  override readonly kind = 'external_service';
  constructor(message: string, details?: unknown, code = 'external_service_error') {
    super(code, message, undefined, details);
  }
}

/** Unexpected internal state (e.g. corrupt persisted data) (→ 500). */
export class InternalError extends AppError {
  override readonly kind = 'internal';
  constructor(message = 'Internal error', details?: unknown, code = 'internal_error') {
    super(code, message, undefined, details);
  }
}
