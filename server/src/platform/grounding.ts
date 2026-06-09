/**
 * Citation grounding moved to @devdigest/reviewer-core (the shared review engine
 * consumed by both this server and the CI agent-runner). This file is a thin
 * re-export shim so existing `platform/grounding.js` importers keep working.
 */
export { groundFindings, groundingSummary, type GroundingResult } from '@devdigest/reviewer-core';
