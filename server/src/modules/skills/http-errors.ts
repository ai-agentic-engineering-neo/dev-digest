import { AppError } from '../../platform/errors.js';
import { SkillDomainError } from './domain.js';

const STATUS: Record<SkillDomainError['code'], number> = {
  skill_name_taken: 409,
  skill_import_invalid: 422,
  skill_import_no_core: 422,
};

/** Map skills domain errors to the API error envelope (inbound side). */
export function toHttpError(err: unknown): unknown {
  if (err instanceof SkillDomainError) return new AppError(err.code, err.message, STATUS[err.code]);
  return err;
}
