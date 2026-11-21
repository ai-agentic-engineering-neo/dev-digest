/** Index coverage metrics (AC-14) — shape = contract `IndexCoverage`. Pure. */
import type { BindingRecord, ImportRow, IndexCoverage, SymbolEdgeRow, UnresolvedReason } from './types.js';

const SPECIFIER_LEVEL = new Set<string>(['missing', 'tsconfig', 'outside_clone', 'non_literal']);

export interface ExportSpecFailure {
  file: string;
  specifier: string | null;
  reason: UnresolvedReason;
  line: number;
}

export interface CoverageInput {
  imports: ImportRow[];
  bindings: BindingRecord[];
  exportFailures: ExportSpecFailure[];
  edges: SymbolEdgeRow[];
  tsconfigFailures: Array<{ path: string; message: string }>;
}

/**
 * - `value`/`type` shares: import bindings whose target is an in-repo
 *   analyzable file (or failed to resolve inside the repo); resolved = reached
 *   a declaring symbol or a namespace. External/builtin/opaque/non-literal and
 *   side-effect imports are not counted (AC-5).
 * - `unresolvedBySpecifier`: distinct (file, specifier) pairs that did not
 *   resolve to a file (imports + re-exports). `unresolvedByReason` also counts
 *   binding-level failures (`cycle`, `ambiguous`, name `missing` in a resolved file).
 */
export function computeCoverage(input: CoverageInput): IndexCoverage {
  const value = { resolved: 0, total: 0 };
  const type = { resolved: 0, total: 0 };
  const byReason: Record<string, number> = {};
  const bump = (r: string): void => {
    byReason[r] = (byReason[r] ?? 0) + 1;
  };

  for (const b of input.bindings) {
    const bd = b.binding;
    const share = b.isType ? type : value;
    if (bd.kind === 'symbol' || bd.kind === 'namespace') {
      share.total++;
      share.resolved++;
    } else if (bd.kind === 'unresolved' && bd.reason !== 'non_literal') {
      share.total++;
    }
  }

  const specKeys = new Set<string>();
  const addSpec = (file: string, spec: string | null, line: number, reason: string): void => {
    const key = spec === null ? `${file}\0#${line}` : `${file}\0${spec}`;
    if (specKeys.has(key)) return;
    specKeys.add(key);
    bump(reason);
  };
  for (const row of input.imports) {
    const r = row.unresolvedReason;
    if (!r || r === 'external' || r === 'builtin') continue;
    if (row.resolvedFile === null && SPECIFIER_LEVEL.has(r)) addSpec(row.fromFile, row.specifier || null, row.line, r);
    else bump(r); // binding-level
  }
  for (const f of input.exportFailures) addSpec(f.file, f.specifier, f.line, f.reason);

  const inferred = input.edges.filter((e) => e.confidence === 'inferred').length;
  return {
    value,
    type,
    unresolvedBySpecifier: specKeys.size,
    unresolvedByReason: byReason,
    tsconfigFailures: input.tsconfigFailures,
    inferredShare: input.edges.length === 0 ? 0 : inferred / input.edges.length,
  };
}
