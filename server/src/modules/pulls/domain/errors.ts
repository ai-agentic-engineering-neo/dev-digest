import { DomainError } from '../../_shared/domain/errors.js';

/** Shared with reviews; re-exported so pulls code keeps one import site. */
export { PullNotFound } from '../../_shared/domain/errors.js';

export class GitHubUnavailable extends DomainError {
  readonly code = 'github_unavailable';
  constructor() {
    super('Connect a GitHub token to post comments.');
  }
}

/** GitHub rejected the comment (line outside the diff, closed PR, …). */
export class GitHubCommentFailed extends DomainError {
  readonly code = 'github_comment_failed';
}
