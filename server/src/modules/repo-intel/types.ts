/**
 * repo-intel contract — the source of truth moved to `domain/ports/repo-intel.ts`
 * (SPEC-16). Re-exported here so existing `./types.js` imports keep working.
 */
export type {
  IndexStatus,
  DegradedReason,
  IndexResult,
  IndexState,
  BlastChangedSymbol,
  BlastCallerRow,
  BlastResult,
  SymbolRow,
  SignatureRow,
  RefRow,
  FileRankRow,
  WeightedFileRow,
  RepoMapResult,
  RepoIntel,
} from '../../domain/ports/repo-intel.js';
