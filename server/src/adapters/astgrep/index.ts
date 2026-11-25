/**
 * ast-grep adapter — tree-sitter-backed TS/JS extractor.
 *
 * This is the AST-accurate complement to `adapters/codeindex/extract.ts`. The
 * regex extractor stays as the ALWAYS-available fallback; this adapter is the
 * "good path" used by the repo-intel facade (wired by T1.3).
 *
 * Compatibility baseline: `ParsedSymbol extends ExtractedSymbol` and
 * `ParsedReference extends ExtractedReference`, so any consumer of the
 * degraded path can swap to this adapter without changing field reads. Extras
 * (`exported`, `signature`, `endLine`, `refFile`) sit alongside.
 *
 * Method symbols follow the legacy extractor's dual-emit convention: each
 * class method is emitted twice — once qualified (`Class.method`) and once
 * bare (`method`) — so reference search resolves both forms.
 *
 * Scope: in-memory parse only. No DB writes, no fs walks beyond the explicit
 * `parseChangedFiles` helper (which reads files diff-scoped under `root`).
 */
// Public barrel — importers use `adapters/astgrep/index.js`; the implementation
// is split by concern into the sibling files re-exported below.
export type {
  ChangedFilesResult,
  ParsedImport,
  ParsedInvocationHead,
  ParsedReference,
  ParsedSymbol,
} from './types.js';
export { langForFile } from './lang.js';
export { parseSymbols } from './symbols.js';
export { parseReferences } from './references.js';
export { parseInvocationHeads } from './invocations.js';
export { parseImports } from './imports.js';
export { parseChangedFiles } from './changed-files.js';
