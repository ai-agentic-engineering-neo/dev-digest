/**
 * AC-19…AC-23 regression predicate (AC-24). Pure and data-only so the fixture
 * gate (P1-F) and the deliberately-broken-variant test share one definition.
 */
import type { GraphResult, ParsedModule } from './types.js';

export const THRESHOLDS = {
  /** AC-19 */ valueResolved: 0.95,
  /** AC-20 */ typeResolved: 0.95,
  /** AC-20 (second half): bindings used in a type position lacking a type edge */ typeBindingsWithoutEdge: 0,
  /** AC-21 */ foreignExactEdges: 0,
  /** AC-22 */ aliasFilesWithoutFileEdge: 0,
  /** AC-23 */ changedIntersectsHunk: 0.95,
  /** AC-23 */ expectedImpactedReported: 1,
} as const;

export interface BlastCaseMeasure {
  changedSymbols: number;
  changedIntersectingHunk: number;
  expectedImpacted: number;
  expectedReported: number;
}

export interface GraphMeasures {
  value: { resolved: number; total: number };
  type: { resolved: number; total: number };
  typeBindingsWithoutEdge: number;
  foreignExactEdges: number;
  aliasFilesWithoutFileEdge: number;
  /** AC-23 inputs from the scripted fixture diffs; omit until blast v2 exists (check is then `skipped`). */
  blast?: BlastCaseMeasure[];
}

export interface ThresholdCheck {
  ac: 'AC-19' | 'AC-20' | 'AC-21' | 'AC-22' | 'AC-23';
  label: string;
  value: number;
  threshold: number;
  status: 'pass' | 'fail' | 'skipped';
}

export interface ThresholdReport {
  pass: boolean;
  checks: ThresholdCheck[];
}

/** An empty denominator is a failure, not a vacuous pass (a gutted fixture must not go green). */
const share = (s: { resolved: number; total: number }): number => (s.total === 0 ? 0 : s.resolved / s.total);

export function evaluateThresholds(m: GraphMeasures): ThresholdReport {
  const checks: ThresholdCheck[] = [];
  const geq = (ac: ThresholdCheck['ac'], label: string, value: number, threshold: number): void => {
    checks.push({ ac, label, value, threshold, status: value >= threshold ? 'pass' : 'fail' });
  };
  const eqZero = (ac: ThresholdCheck['ac'], label: string, value: number): void => {
    checks.push({ ac, label, value, threshold: 0, status: value === 0 ? 'pass' : 'fail' });
  };
  geq('AC-19', 'value import bindings resolved', share(m.value), THRESHOLDS.valueResolved);
  geq('AC-20', 'type import bindings resolved', share(m.type), THRESHOLDS.typeResolved);
  eqZero('AC-20', 'used type bindings without a type edge', m.typeBindingsWithoutEdge);
  eqZero('AC-21', 'exact edges to a non-binding, non-local target', m.foreignExactEdges);
  eqZero('AC-22', 'alias-only importers without a file edge', m.aliasFilesWithoutFileEdge);
  if (m.blast && m.blast.length > 0) {
    const sum = (k: keyof BlastCaseMeasure): number => m.blast!.reduce((a, b) => a + b[k], 0);
    const changed = sum('changedSymbols');
    geq('AC-23', 'changed symbols intersecting a hunk', changed === 0 ? 0 : sum('changedIntersectingHunk') / changed, THRESHOLDS.changedIntersectsHunk);
    const exp = sum('expectedImpacted');
    geq('AC-23', 'expected impacted symbols reported', exp === 0 ? 0 : sum('expectedReported') / exp, THRESHOLDS.expectedImpactedReported);
  } else {
    checks.push({ ac: 'AC-23', label: 'blast changed/impacted (no blast measures supplied)', value: 0, threshold: THRESHOLDS.changedIntersectsHunk, status: 'skipped' });
  }
  return { pass: checks.every((c) => c.status !== 'fail'), checks };
}

/**
 * Derive the graph-side measures (AC-19…AC-22) from a built graph.
 * `aliasOnlyFiles` = fixture files importing an in-repo module only via a path alias.
 */
export function measureGraph(
  files: ParsedModule[],
  graph: GraphResult,
  aliasOnlyFiles: string[] = [],
): Omit<GraphMeasures, 'blast'> {
  let foreign = 0;
  for (const e of graph.edges) {
    if (e.confidence !== 'exact') continue;
    const allowed = graph.exactTargets.get(e.fromPath);
    if (!allowed?.has(`${e.toPath}\0${e.toName}`)) foreign++;
  }

  // AC-20: every type-only binding that resolved to a symbol AND is used needs a type-ish edge.
  const usesByFile = new Map<string, Set<string>>();
  for (const f of files) {
    usesByFile.set(f.path, new Set(f.facts.references.filter((r) => r.receiver === null && r.kind !== 'member').map((r) => r.name)));
  }
  // file → set of `toPath\0toName` reached by any type/extends/implements edge from that file
  const typeEdgesByFile = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind !== 'type' && e.kind !== 'extends' && e.kind !== 'implements') continue;
    let set = typeEdgesByFile.get(e.fromPath);
    if (!set) typeEdgesByFile.set(e.fromPath, (set = new Set()));
    set.add(`${e.toPath}\0${e.toName}`);
  }
  let typeMissing = 0;
  for (const b of graph.bindings) {
    if (!b.isType || b.binding.kind !== 'symbol' || !b.localName) continue;
    if (!usesByFile.get(b.file)?.has(b.localName)) continue;
    if (!typeEdgesByFile.get(b.file)?.has(`${b.binding.file}\0${b.binding.symbol}`)) typeMissing++;
  }

  const fileEdgeFroms = new Set(graph.fileEdges.map((e) => e.from));
  return {
    value: graph.coverage.value,
    type: graph.coverage.type,
    typeBindingsWithoutEdge: typeMissing,
    foreignExactEdges: foreign,
    aliasFilesWithoutFileEdge: aliasOnlyFiles.filter((f) => !fileEdgeFroms.has(f)).length,
  };
}
