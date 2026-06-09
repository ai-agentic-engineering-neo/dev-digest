/**
 * Prompt assembly moved to @devdigest/reviewer-core (the shared review engine
 * consumed by both this server and the CI agent-runner). This file is a thin
 * re-export shim so existing `platform/prompt.js` importers keep working.
 */
export {
  assemblePrompt,
  wrapUntrusted,
  type PromptParts,
  type AssembledPrompt,
} from '@devdigest/reviewer-core';
