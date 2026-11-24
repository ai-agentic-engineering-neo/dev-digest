/**
 * Base class for business failures raised by domain/application code.
 * Carries a stable `code` and NO HTTP status — the delivery layer maps
 * codes to statuses in one place (platform/errors.ts DOMAIN_STATUS, used by
 * the error handler in app.ts).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
