import { DomainError } from '../../_shared/domain/errors.js';

export class AgentNotFound extends DomainError {
  readonly code = 'agent_not_found';
  constructor() {
    super('Agent not found');
  }
}

export class AgentVersionNotFound extends DomainError {
  readonly code = 'agent_version_not_found';
  constructor() {
    super('Agent version not found');
  }
}
