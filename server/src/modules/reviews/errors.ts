import { DomainError } from '../_shared/domain/errors.js';

/** The agent named in a run request is not in the workspace. */
export class RunAgentNotFound extends DomainError {
  readonly code = 'agent_not_found';
  constructor() {
    super('Agent not found');
  }
}

export class InvalidRunRequest extends DomainError {
  readonly code = 'invalid_run_request';
  constructor() {
    super('Provide agentId or all:true');
  }
}

export class FindingNotFound extends DomainError {
  readonly code = 'finding_not_found';
  constructor() {
    super('Finding not found');
  }
}

export class InvalidFindingAction extends DomainError {
  readonly code = 'invalid_action';
  constructor(action: string) {
    super(`Action '${action}' is not available in the starter`);
  }
}

export class ReviewNotFound extends DomainError {
  readonly code = 'review_not_found';
  constructor() {
    super('Review not found');
  }
}

export class RunTraceNotFound extends DomainError {
  readonly code = 'run_trace_not_found';
  constructor() {
    super('Run trace not found');
  }
}
