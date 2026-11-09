import { AppError } from '../../platform/errors.js';

export type BriefFailureReason = 'timeout' | 'invalid_reply' | 'provider_error';

export class BriefNoChangedFilesError extends AppError {
  constructor() {
    super('brief_no_changed_files', 'This pull request has no changed files to brief', 422);
  }
}

export class BriefTooLargeError extends AppError {
  constructor(tokens: number, limit: number) {
    super('brief_too_large', 'The pull request is too large for a risk brief', 422, { tokens, limit });
  }
}

export class BriefModelNotConfiguredError extends AppError {
  constructor(provider: string) {
    super('brief_model_not_configured', `No API key configured for provider "${provider}"`, 422, { provider });
  }
}

/** Fixed client-facing text per reason — the raw provider message never reaches the API. */
const FAILURE_MESSAGES: Record<BriefFailureReason, string> = {
  timeout: 'Brief generation failed: the model call took too long',
  invalid_reply: "Brief generation failed: the model's reply was invalid",
  provider_error: 'Brief generation failed: the model provider returned an error',
};

export class BriefGenerationError extends AppError {
  /** Raw provider message — for the server log only; never serialized into a response. */
  readonly providerMessage: string;

  constructor(reason: BriefFailureReason, providerMessage: string) {
    super('brief_generation_failed', FAILURE_MESSAGES[reason], 502, { reason });
    this.providerMessage = providerMessage;
  }
}

export function classifyGenerationError(e: unknown): BriefFailureReason {
  const name = e instanceof Error ? e.name : '';
  const message = e instanceof Error ? e.message : String(e);
  if (name === 'TimeoutError' || name === 'APIConnectionTimeoutError' || /timed out/i.test(message)) {
    return 'timeout';
  }
  if (/schema validation/i.test(message)) return 'invalid_reply';
  return 'provider_error';
}
