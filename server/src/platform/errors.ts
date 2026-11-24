/**
 * Domain error taxonomy + structured API error envelope. The UX taxonomy
 * (toast/inline/full-screen) is the frontend's concern; the API returns a
 * stable structured body (ApiErrorBody): { error: { code, message, details } }.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super('not_found', message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('validation_error', message, 422, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super('external_service_error', message, 502, details);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super('config_error', message, 500, details);
  }
}

/**
 * HTTP status for each DomainError code (modules/_shared/domain/errors.ts).
 * Domain code never knows its status; the error handler in app.ts looks it up
 * here. An unmapped code falls back to 400.
 */
export const DOMAIN_STATUS: Readonly<Record<string, number>> = {
  agent_not_found: 404,
  agent_version_not_found: 404,
  repo_not_found: 404,
  invalid_repo_url: 400,
  invalid_run_request: 400,
  finding_not_found: 404,
  invalid_action: 400,
  review_not_found: 404,
  run_trace_not_found: 404,
  pull_not_found: 404,
  github_unavailable: 400,
  github_comment_failed: 400,
};
