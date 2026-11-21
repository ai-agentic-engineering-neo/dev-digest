/**
 * Dependency-graph regression gate (plan 19 / P1-F; AC-19…AC-24).
 * Hermetic and in-memory: committed synthetic repo -> parseModuleFacts ->
 * real TsModuleResolverFactory -> buildGraph -> measureGraph ->
 * evaluateThresholds. No DB, no network, no git.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODULE_SYMBOL, parseModuleFacts } from '../src/adapters/astgrep/module-facts.js';
import type { ModuleResolution, ModuleResolverInstance } from '../src/domain/ports/module-resolver.js';
import {
  buildGraph,
  evaluateThresholds,
  measureGraph,
  type BlastCaseMeasure,
  type GraphResult,
  type ParsedModule,
} from '../src/modules/repo-intel/graph/index.js';
import { computeBlast, memoryBlastSource } from '../src/modules/repo-intel/graph/blast.js';
import { computeChangedSymbols } from '../src/modules/repo-intel/graph/changed.js';
import { changedSymbols, intersectsHunk, parseFiles, parseHunks, realResolver, walkTree } from './depgraph-fixture-utils.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/depgraph');
const FILES = walkTree(ROOT, ['diffs']);
const MODULES = parseFiles(ROOT, FILES);

/** Files that import in-repo modules ONLY through a tsconfig `paths` alias (the M7 population). */
const ALIAS_ONLY = ['pkg-a/src/service.ts', 'pkg-a/src/app.ts', 'pkg-a/src/boot.ts', 'pkg-b/app/main.ts', 'pkg-b/app/second.ts'];

function run(resolver: ModuleResolverInstance): { graph: GraphResult; report: ReturnType<typeof evaluateThresholds>; measures: ReturnType<typeof measureGraph> } {
  const graph = buildGraph(MODULES, resolver);
  const measures = measureGraph(MODULES, graph, ALIAS_ONLY);
  return { graph, measures, report: evaluateThresholds(measures) };
}

const failing = (r: ReturnType<typeof evaluateThresholds>): string[] => r.checks.filter((c) => c.status === 'fail').map((c) => `${c.ac} ${c.label}=${c.value}`);

describe('fixture sanity', () => {
  it('walks a deterministic, hermetic file set with no excluded directory names', () => {
    expect(FILES).toEqual([...FILES].sort());
    expect(FILES.filter((f) => /(^|\/)(vendor|dist|build|node_modules)(\/|$)/.test(f))).toEqual([]);
    for (const ext of ['.ts', '.d.ts', '.js', '.mjs', '.cjs', '.jsx']) expect(FILES.some((f) => f.endsWith(ext))).toBe(true);
    // No root tsconfig: every tsconfig is per-package / shared config (M7).
    expect(FILES).not.toContain('tsconfig.json');
    expect(FILES.filter((f) => f.endsWith('tsconfig.json'))).toEqual(['pkg-a/tsconfig.json', 'pkg-b/tsconfig.json']);
  });
});

describe('AC-19…AC-22 on the real resolver', () => {
  const { graph, measures, report } = run(realResolver(ROOT, FILES));

  it('passes every graph threshold (AC-19, AC-20, AC-21, AC-22)', () => {
    expect(failing(report)).toEqual([]);
    expect(report.checks.filter((c) => c.ac !== 'AC-23').every((c) => c.status === 'pass')).toBe(true);
  });

  it('AC-19: value bindings resolve at >= 95%', () => {
    expect(measures.value.total).toBeGreaterThan(20);
    expect(measures.value.resolved / measures.value.total).toBeGreaterThanOrEqual(0.95);
  });

  it('AC-20: type bindings resolve and every used type binding has a type edge', () => {
    expect(measures.type.total).toBeGreaterThanOrEqual(5);
    expect(measures.type.resolved / measures.type.total).toBeGreaterThanOrEqual(0.95);
    expect(measures.typeBindingsWithoutEdge).toBe(0);
    expect(graph.edges.some((e) => e.kind === 'type' && e.toName === 'Shape')).toBe(true);
  });

  it('AC-21: no exact edge to a name that is neither an import binding nor a local declaration', () => {
    expect(measures.foreignExactEdges).toBe(0);
  });

  it('AC-22: alias-only importers (own tsconfig paths, no root tsconfig) all have a file edge', () => {
    expect(measures.aliasFilesWithoutFileEdge).toBe(0);
    for (const f of ALIAS_ONLY) expect(graph.fileEdges.some((e) => e.from === f), f).toBe(true);
  });

  it('M4 collision: `this.repo.get()` never produces an exact edge to the unrelated imported `get`', () => {
    const fromRun = graph.edges.filter((e) => e.fromPath === 'pkg-a/src/service.ts' && e.fromName === 'Service.run');
    expect(fromRun.filter((e) => e.toPath === 'pkg-a/src/util.ts' && e.confidence === 'exact')).toEqual([]);
    // ...while the genuine bare call `get(1)` in `other` is an exact edge.
    expect(graph.edges.some((e) => e.fromName === 'other' && e.toPath === 'pkg-a/src/util.ts' && e.toName === 'get' && e.confidence === 'exact')).toBe(true);
  });

  it('assets are external, not unresolved; the missing relative import and non-literal dynamic loads are the only failures', () => {
    const btn = graph.imports.filter((i) => i.fromFile === 'web-js/components/Button.jsx');
    for (const spec of ['./logo.svg', './index.css']) {
      expect(btn.find((i) => i.specifier === spec)?.unresolvedReason, spec).toBe('external');
    }
    // `import X from '.'` / `from '..'` resolve to the directory index.
    expect(btn.find((i) => i.specifier === '.')?.resolvedFile).toBe('web-js/components/index.js');
    expect(btn.find((i) => i.specifier === '..')?.resolvedFile).toBe('web-js/index.js');
    const unresolved = graph.imports.filter((i) => i.unresolvedReason && i.unresolvedReason !== 'external' && i.unresolvedReason !== 'builtin');
    expect(unresolved.map((i) => `${i.fromFile} ${i.specifier || '<non-literal>'} ${i.unresolvedReason}`).sort()).toEqual([
      'pkg-a/src/consumer.ts ./index ambiguous',
      'pkg-a/src/dyn.ts ./missing-module missing',
      'pkg-a/src/dyn.ts <non-literal> non_literal',
      'web-js/legacy.cjs <non-literal> non_literal',
    ].sort());
    expect(graph.coverage.tsconfigFailures).toEqual([]);
  });

  it('plain-JS default/named exports of earlier values (Mongoose-model style) bind to symbols', () => {
    const user = graph.bindings.filter((b) => b.file === 'web-js/components/Button.jsx' && ['User', 'Role', 'Y'].includes(b.localName));
    expect(user).toHaveLength(3);
    for (const b of user) expect(b.binding.kind, b.localName).toBe('symbol');
  });
});

// ---------------------------------------------------------------------------
// AC-23 (changed symbols): the hunk ∩ declaration step against the scripted
// diffs, via the test-local reference implementation in depgraph-fixture-utils.
// ---------------------------------------------------------------------------

interface DiffCase {
  description: string;
  file: string;
  oldSource?: string;
  patch: string;
  expectedChanged: string[];
  expectedImpacted: string[];
}

const DIFF_NAMES = ['modified-body', 'added-decl', 'deleted-decl', 'module-scope-only', 'type-position-only'] as const;
const loadDiff = (n: string): DiffCase => JSON.parse(readFileSync(join(ROOT, 'diffs', `${n}.json`), 'utf8')) as DiffCase;

describe('AC-23 changed symbols (hunk ∩ declaration)', () => {
  const measured: BlastCaseMeasure[] = [];

  for (const name of DIFF_NAMES) {
    it(`${name}: reports exactly the expected changed symbols`, () => {
      const d = loadDiff(name);
      expect(d.expectedChanged.length).toBeGreaterThan(0);
      const head = MODULES.find((m) => m.path === d.file)!.facts.symbols;
      const base = d.oldSource === undefined ? head : parseModuleFacts(d.file, d.oldSource).symbols;
      const hunks = parseHunks(d.patch);
      expect(hunks.length).toBeGreaterThan(0);
      const reported = changedSymbols(base, head, hunks);
      expect(reported).toEqual([...d.expectedChanged].sort());
      measured.push({
        changedSymbols: reported.length,
        changedIntersectingHunk: reported.filter((s) => intersectsHunk(s, base, head, hunks)).length,
        expectedImpacted: 0, // the impacted half is asserted against the real blast core below
        expectedReported: 0,
      });
    });
  }

  it('>= 95% of reported changed symbols intersect a hunk, over all scripted diffs', () => {
    const changed = measured.reduce((a, m) => a + m.changedSymbols, 0);
    const hit = measured.reduce((a, m) => a + m.changedIntersectingHunk, 0);
    expect(changed).toBe(DIFF_NAMES.length);
    expect(hit / changed).toBeGreaterThanOrEqual(0.95);
    expect(MODULE_SYMBOL).toBe('<module>');
  });

});

// ---------------------------------------------------------------------------
// AC-23 (expected impacted): the PURE blast core (changed.ts + blast.ts over
// an in-memory edge source) must report 100% of each scripted diff's
// `expectedImpacted`, and its changed set must equal `expectedChanged`.
// ---------------------------------------------------------------------------

describe('AC-23 expected impacted (pure blast core, in-memory edge source)', () => {
  const graph = buildGraph(MODULES, realResolver(ROOT, FILES));
  const source = memoryBlastSource(graph.edges);
  const measuredBlast: BlastCaseMeasure[] = [];

  for (const name of DIFF_NAMES) {
    it(`${name}: reports 100% of expectedImpacted`, async () => {
      const d = loadDiff(name);
      const head = MODULES.find((m) => m.path === d.file)!.facts.symbols;
      const base = d.oldSource === undefined ? head : parseModuleFacts(d.file, d.oldSource).symbols;
      const changed = computeChangedSymbols({
        files: [{ path: d.file, status: 'modified', patch: d.patch }],
        base: new Map([[d.file, base]]),
        head: new Map([[d.file, head]]),
      });
      expect(changed.map((c) => c.name).sort()).toEqual([...d.expectedChanged].sort());

      const res = await computeBlast(
        changed.map((c) => ({ path: c.path, name: c.name, kind: c.kind, deleted: c.deleted })),
        source,
      );
      const reported = new Set(res.graph.nodes.filter((n) => n.role !== 'changed').map((n) => n.id));
      const hit = d.expectedImpacted.filter((id) => reported.has(id));
      expect(hit, `missing: ${d.expectedImpacted.filter((id) => !reported.has(id)).join(', ')}`).toEqual(d.expectedImpacted);
      expect(res.graph.truncation.truncated).toBe(false);
      measuredBlast.push({
        changedSymbols: changed.length,
        changedIntersectingHunk: changed.length,
        expectedImpacted: d.expectedImpacted.length,
        expectedReported: hit.length,
      });
    });
  }

  it('the AC-23 predicate passes on the measured diffs (100% expected impacted)', () => {
    expect(measuredBlast.reduce((a, m) => a + m.expectedImpacted, 0)).toBeGreaterThan(0);
    const { measures } = run(realResolver(ROOT, FILES));
    const report = evaluateThresholds({ ...measures, blast: measuredBlast });
    expect(report.checks.find((c) => c.ac === 'AC-23' && c.label.includes('impacted'))?.status).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// AC-24: the gate must be able to fail. Same predicate, deliberately broken
// resolvers; each MUST trip at least one threshold.
// ---------------------------------------------------------------------------

describe('AC-24 the regression predicate fails for a broken resolver', () => {
  const real = realResolver(ROOT, FILES);
  const relativeOnly: ModuleResolverInstance = {
    // never resolves aliases: the exact M7 defect (alias imports look like npm packages)
    resolve: (from, spec): ModuleResolution => (spec.startsWith('.') ? real.resolve(from, spec) : { kind: 'external' }),
    tsconfigFailures: () => [],
  };
  const nameJoin: ModuleResolverInstance = {
    // v1-style "join on name": every import lands on one arbitrary file regardless of what it binds
    resolve: (_from, spec): ModuleResolution => (spec.startsWith('node:') ? { kind: 'builtin' } : { kind: 'file', path: 'pkg-a/src/lazy.ts' }),
    tsconfigFailures: () => [],
  };
  const nothingResolves: ModuleResolverInstance = {
    resolve: (): ModuleResolution => ({ kind: 'unresolved', reason: 'missing' }),
    tsconfigFailures: () => [],
  };

  it('control: the real resolver passes the same predicate', () => {
    expect(run(real).report.pass).toBe(true);
  });

  it.each([
    ['alias-blind resolver', relativeOnly, 'AC-22'],
    ['name-join resolver', nameJoin, 'AC-19'],
    ['resolver that resolves nothing', nothingResolves, 'AC-19'],
  ] as const)('%s fails (%s tripped)', (_label, resolver, ac) => {
    const { report } = run(resolver);
    expect(report.pass).toBe(false);
    expect(report.checks.some((c) => c.ac === ac && c.status === 'fail')).toBe(true);
  });
});
