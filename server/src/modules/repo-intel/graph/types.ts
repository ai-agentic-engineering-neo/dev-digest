/**
 * Graph core types (plan 19 / P1-D). Rows map 1:1 onto the `file_imports`,
 * `file_exports`, `symbol_edges` columns (db/schema/repo-intel.ts) minus
 * `repo_id`, which the pipeline (P1-E) adds. Pure data — no I/O.
 */
import type { BlastConfidence, BlastEdgeKind, IndexCoverage, UnresolvedReason } from '../../../vendor/shared/index.js';
import type { ModuleFacts, ModuleSymbol } from '../../../domain/module-facts.js';

export type { BlastConfidence, BlastEdgeKind, IndexCoverage, UnresolvedReason };

export interface ParsedModule {
  /** Repo-relative posix path. */
  path: string;
  facts: ModuleFacts;
}

/** `unresolved_reason` column: graph reasons plus the two non-failure kinds. */
export type ImportUnresolvedReason = UnresolvedReason | 'external' | 'builtin';

export interface ImportRow {
  fromFile: string;
  idx: number;
  /** '' for side-effect / unbound imports (column is NOT NULL). */
  localName: string;
  /** '' for side-effect imports. */
  importedName: string;
  /** '' for non-literal specifiers. */
  specifier: string;
  isType: boolean;
  kind: 'static' | 'dynamic' | 'require';
  line: number;
  resolvedFile: string | null;
  unresolvedReason: ImportUnresolvedReason | null;
}

export interface ExportRow {
  file: string;
  exportedName: string;
  localName: string | null;
  kind: 'local' | 'default' | 'reexport' | 'reexport_all' | 'namespace';
  specifier: string | null;
  resolvedFile: string | null;
  line: number;
}

export type SymbolRow = ModuleSymbol & { file: string };

export interface SymbolEdgeRow {
  fromPath: string;
  fromName: string;
  toPath: string;
  toName: string;
  kind: BlastEdgeKind;
  confidence: BlastConfidence;
  line: number;
}

export interface FileEdge {
  from: string;
  to: string;
}

/** What a `references` row's `decl_file` should become. */
export interface ReferenceDecl {
  file: string;
  name: string;
  line: number;
  /** Declaring file; null unless `via` is `exact`/`inferred`. */
  declFile: string | null;
  via: 'exact' | 'inferred' | 'external' | 'unresolved';
}

/** Where an import binding landed (bindings.ts). */
export type Binding =
  | { kind: 'symbol'; file: string; symbol: string; symbolKind: string | null }
  | { kind: 'namespace'; file: string }
  /** Resolved to an in-repo file that was not parsed (json, css, …): no declaring symbol, not counted. */
  | { kind: 'opaque'; file: string }
  | { kind: 'external' }
  | { kind: 'builtin' }
  | { kind: 'unresolved'; reason: UnresolvedReason; file: string | null };

export interface BindingRecord {
  file: string;
  idx: number;
  localName: string;
  isType: boolean;
  binding: Binding;
}

export interface GraphResult {
  imports: ImportRow[];
  exports: ExportRow[];
  symbols: SymbolRow[];
  edges: SymbolEdgeRow[];
  /** Derived from resolved imports + re-export specifiers (R-2). */
  fileEdges: FileEdge[];
  coverage: IndexCoverage;
  referencesDeclFile: ReferenceDecl[];
  /** Import-binding provenance (used by thresholds.ts and tests). */
  bindings: BindingRecord[];
  /** `file` → set of `toPath\0toName` the file may legitimately target exactly. */
  exactTargets: Map<string, Set<string>>;
}
