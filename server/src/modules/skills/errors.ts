import { AppError } from '../../platform/errors.js';

/**
 * 409 — the request conflicts with current state (duplicate skill name,
 * restoring the version that is already current).
 *
 * Lives in the module because `platform/errors.ts` was out of scope for M2's
 * skills task; move it there once a second module needs a 409.
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super('conflict', message, 409, details);
  }
}
