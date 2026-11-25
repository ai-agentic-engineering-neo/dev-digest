/**
 * Public row shapes of the ast-grep adapter — supersets of the regex
 * extractor's (`adapters/codeindex/extract.ts`) so consumers can swap paths
 * without changing field reads.
 */
import type { ExtractedReference, ExtractedSymbol } from '../codeindex/extract.js';

// ---------------------------------------------------------------------------
// Public types — superset of the regex extractor's row shapes.
// ---------------------------------------------------------------------------

export interface ParsedSymbol extends ExtractedSymbol {
  /** True when the declaration is reached through an `export` form. */
  exported: boolean;
  /** Declaration head trimmed to MAX_SIGNATURE_CHARS; null for kinds without one. */
  signature: string | null;
  /** 1-based line of the closing token of the declaration body. */
  endLine: number;
}

export interface ParsedReference extends ExtractedReference {
  /** Path passed in by the caller — surfaced so consumers can fan-out. */
  refFile: string;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

export interface ParsedInvocationHead {
  /** The bare identifier being invoked (callee name, ctor name, or JSX tag). */
  name: string;
  /** 1-based line of the invocation. */
  line: number;
  /** Which AST shape produced this head. */
  kind: 'call' | 'new' | 'jsx';
}

export interface ChangedFilesResult {
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: Array<ParsedImport & { file: string }>;
}
