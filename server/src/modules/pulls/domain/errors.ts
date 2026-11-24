import { DomainError } from '../../_shared/domain/errors.js';

export class PullNotFound extends DomainError {
  readonly code = 'pull_not_found';
  constructor() {
    super('Pull request not found');
  }
}

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
