/**
 * Re-export only. The unified-diff parser lives in reviewer-core
 * (`reviewer-core/src/diff/parse.ts`) — pure engine logic shared by the
 * server and the CI runner (spec: `reviewer-core/specs/L03-diff-parser.md`).
 * `diff-loader.ts` keeps importing this adapter path (onion-architecture §11).
 */
export { parseUnifiedDiff } from '@devdigest/reviewer-core';
