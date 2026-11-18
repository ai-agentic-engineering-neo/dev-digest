import { describe, expect, it } from 'vitest';
import { evaluateThresholds, measureGraph } from '../src/modules/repo-intel/graph/index.js';
import { build } from './graph-test-utils.js';

const SOURCES = {
  'src/lib/a.ts': `export function a() {}\nexport interface T {}`,
  'src/lib/index.ts': `export * from './a';`,
  'app/u.ts': `import { a } from '@/lib';\nimport type { T } from '@/lib/a';\nexport function r(t: T) { a(); }`,
};

describe('thresholds (AC-19…AC-24)', () => {
  it('passes on a healthy graph', () => {
    const { graph, modules } = build(SOURCES);
    const m = measureGraph(modules, graph, ['app/u.ts']);
    const report = evaluateThresholds({ ...m, blast: [{ changedSymbols: 20, changedIntersectingHunk: 20, expectedImpacted: 4, expectedReported: 4 }] });
    expect(report.checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(report.pass).toBe(true);
    expect(m.foreignExactEdges).toBe(0);
    expect(m.typeBindingsWithoutEdge).toBe(0);
  });

  it('skips AC-23 when no blast measures are supplied, and fails an empty fixture', () => {
    const { graph, modules } = build(SOURCES);
    const r = evaluateThresholds(measureGraph(modules, graph));
    expect(r.checks.find((c) => c.ac === 'AC-23')!.status).toBe('skipped');
    const empty = build({});
    expect(evaluateThresholds(measureGraph(empty.modules, empty.graph)).pass).toBe(false);
  });

  it('a deliberately broken variant (v1-style name join, unresolved aliases) fails the gate', () => {
    const { graph, modules } = build(SOURCES);
    const good = measureGraph(modules, graph, ['app/u.ts']);
    const broken = {
      ...good,
      value: { resolved: 37, total: 100 }, // AC-19 regression
      type: { resolved: 0, total: 5 }, // AC-20
      typeBindingsWithoutEdge: 3,
      foreignExactEdges: 17, // AC-21
      aliasFilesWithoutFileEdge: 57, // AC-22
      blast: [{ changedSymbols: 100, changedIntersectingHunk: 21, expectedImpacted: 5, expectedReported: 4 }], // AC-23
    };
    const report = evaluateThresholds(broken);
    expect(report.pass).toBe(false);
    expect(report.checks.filter((c) => c.status === 'fail').map((c) => c.ac)).toEqual(['AC-19', 'AC-20', 'AC-20', 'AC-21', 'AC-22', 'AC-23', 'AC-23']);
  });

  it('measureGraph detects a foreign exact edge and a missing alias file edge', () => {
    const { graph, modules } = build(SOURCES);
    graph.edges.push({ fromPath: 'app/u.ts', fromName: 'r', toPath: 'src/lib/a.ts', toName: 'ghost', kind: 'call', confidence: 'exact', line: 9 });
    expect(measureGraph(modules, graph).foreignExactEdges).toBe(1);
    expect(measureGraph(modules, graph, ['nowhere.ts']).aliasFilesWithoutFileEdge).toBe(1);
  });
});
