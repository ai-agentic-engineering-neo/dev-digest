/**
 * Structured-output helpers moved to @devdigest/reviewer-core (the shared review
 * engine consumed by both this server and the CI agent-runner). This file is a
 * thin re-export shim so existing `platform/structured.js` importers keep working.
 */
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  type JsonSchema,
  type ParseResult,
} from '@devdigest/reviewer-core';
