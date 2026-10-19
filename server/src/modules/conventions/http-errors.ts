import { AppError } from '../../platform/errors.js';
import { ConventionDomainError } from './domain.js';

const STATUS: Record<ConventionDomainError['code'], number> = {
  extract_in_progress: 409,
  repo_not_indexed: 409,
};

/** Map conventions domain errors to the API error envelope (inbound side). */
export function toHttpError(err: unknown): unknown {
  if (err instanceof ConventionDomainError) return new AppError(err.code, err.message, STATUS[err.code]);
  return err;
}
