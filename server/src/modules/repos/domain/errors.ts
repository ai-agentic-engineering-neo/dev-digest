import { DomainError } from '../../_shared/domain/errors.js';

/** The URL (or a stored owner/name) is not an importable GitHub repo. */
export class InvalidRepoUrl extends DomainError {
  readonly code = 'invalid_repo_url';
}
