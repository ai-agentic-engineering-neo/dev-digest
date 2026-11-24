/**
 * Base class for business failures raised by domain/application code.
 * Carries a stable `code` (and optional `details`) but NO HTTP status — the
 * delivery layer maps codes to statuses in one place (platform/errors.ts
 * DOMAIN_STATUS, used by the error handler in app.ts).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A repo id that does not exist in the caller's workspace (shared by repo-scoped modules). */
export class RepoNotFound extends DomainError {
  readonly code = 'repo_not_found';
  constructor() {
    super('Repo not found');
  }
}
