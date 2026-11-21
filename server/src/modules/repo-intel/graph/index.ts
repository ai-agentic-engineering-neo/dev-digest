/**
 * Dependency-graph core entry (plan 19 / P1-D). Pure: parsed facts + an
 * injected resolver instance in, rows out. P1-E persists them.
 */
import { MODULE_SYMBOL } from '../../../domain/module-facts.js';
import type { ModuleResolverInstance } from '../../../domain/ports/module-resolver.js';
import { createBindingContext } from './bindings.js';
import { computeCoverage, type ExportSpecFailure } from './coverage.js';
import { buildFileEdges } from './edges.js';
import type {
  Binding,
  BindingRecord,
  ExportRow,
  FileEdge,
  GraphResult,
  ImportRow,
  ImportUnresolvedReason,
  ParsedModule,
  ReferenceDecl,
  SymbolEdgeRow,
  SymbolRow,
} from './types.js';

export * from './types.js';
export { createBindingContext } from './bindings.js';
export { computeCoverage } from './coverage.js';
export * from './thresholds.js';

function reasonOf(b: Binding): ImportUnresolvedReason | null {
  if (b.kind === 'external' || b.kind === 'builtin') return b.kind;
  if (b.kind === 'unresolved') return b.reason;
  return null;
}

export function buildGraph(files: ParsedModule[], resolver: ModuleResolverInstance): GraphResult {
  // Deterministic order, last duplicate path wins.
  const unique = [...new Map(files.map((f) => [f.path, f])).values()].sort((a, b) => (a.path < b.path ? -1 : 1));
  const ctx = createBindingContext(unique, resolver);

  const imports: ImportRow[] = [];
  const exportsOut: ExportRow[] = [];
  const symbols: SymbolRow[] = [];
  const edges: SymbolEdgeRow[] = [];
  const referencesDeclFile: ReferenceDecl[] = [];
  const bindings: BindingRecord[] = [];
  const exportFailures: ExportSpecFailure[] = [];
  const exactTargets = new Map<string, Set<string>>();
  const fileEdgeSet = new Set<string>();
  const fileEdges: FileEdge[] = [];
  const addFileEdge = (from: string, to: string | null): void => {
    if (!to || to === from) return;
    const k = `${from}\0${to}`;
    if (fileEdgeSet.has(k)) return;
    fileEdgeSet.add(k);
    fileEdges.push({ from, to });
  };

  for (const m of unique) {
    const fi = ctx.file(m.path)!;
    for (const s of m.facts.symbols) symbols.push({ ...s, file: m.path });

    // ---- imports ----
    const fileBindings: BindingRecord[] = [];
    m.facts.imports.forEach((imp, idx) => {
      const binding = ctx.bindImport(m.path, imp);
      let resolvedFile: string | null = null;
      if (imp.specifier !== null) {
        const r = ctx.resolveSpecifier(m.path, imp.specifier);
        if (r.kind === 'file') resolvedFile = r.path;
      }
      imports.push({
        fromFile: m.path,
        idx,
        localName: imp.localName ?? '',
        importedName: imp.importedName ?? '',
        specifier: imp.specifier ?? '',
        isType: imp.isType,
        kind: imp.kind,
        line: imp.line,
        resolvedFile,
        unresolvedReason: reasonOf(binding),
      });
      addFileEdge(m.path, resolvedFile);
      if (imp.importedName !== null) {
        const rec: BindingRecord = { file: m.path, idx, localName: imp.localName ?? '', isType: imp.isType, binding };
        fileBindings.push(rec);
        bindings.push(rec);
      }
    });

    // ---- exports (+ re-export edges) ----
    const seenExport = new Set<string>();
    const reexportEdges: SymbolEdgeRow[] = [];
    for (const e of m.facts.exports) {
      const key = `${e.exportedName}\0${e.kind}`;
      if (seenExport.has(key)) continue;
      seenExport.add(key);
      let resolvedFile: string | null = null;
      if (e.specifier !== null) {
        const r = ctx.resolveSpecifier(m.path, e.specifier);
        if (r.kind === 'file') resolvedFile = r.path;
        else if (r.kind === 'unresolved') {
          exportFailures.push({ file: m.path, specifier: e.specifier, reason: r.reason, line: e.line });
        }
      } else if (e.kind === 'reexport' || e.kind === 'reexport_all' || e.kind === 'namespace') {
        exportFailures.push({ file: m.path, specifier: null, reason: 'non_literal', line: e.line });
      }
      exportsOut.push({
        file: m.path,
        exportedName: e.exportedName,
        localName: e.localName,
        kind: e.kind,
        specifier: e.specifier,
        resolvedFile,
        line: e.line,
      });
      addFileEdge(m.path, resolvedFile);

      // re-export edge: <module> of the barrel → declaring symbol (or target module for `*` / `* as ns`)
      let target: { file: string; name: string } | null = null;
      if (e.kind === 'reexport_all' || e.kind === 'namespace') {
        if (resolvedFile && ctx.file(resolvedFile)) target = { file: resolvedFile, name: MODULE_SYMBOL };
      } else if (e.kind === 'reexport') {
        const b = ctx.lookupExport(m.path, e.exportedName);
        if (b.kind === 'symbol') target = { file: b.file, name: b.symbol };
      } else {
        const ln = e.localName ?? e.exportedName;
        if (!fi.declared.has(ln) && fi.importByLocal.has(ln)) {
          const b = ctx.lookupExport(m.path, e.exportedName);
          if (b.kind === 'symbol') target = { file: b.file, name: b.symbol };
        }
      }
      if (target) {
        reexportEdges.push({
          fromPath: m.path,
          fromName: MODULE_SYMBOL,
          toPath: target.file,
          toName: target.name,
          kind: 're-export',
          confidence: 'exact',
          line: e.line,
        });
      }
    }
    const reSeen = new Set<string>();
    for (const re of reexportEdges) {
      const k = `${re.toPath}\0${re.toName}\0${re.line}`;
      if (reSeen.has(k)) continue;
      reSeen.add(k);
      edges.push(re);
    }

    // ---- reference edges ----
    const fe = buildFileEdges(ctx, fi, fileBindings);
    edges.push(...fe.edges);
    referencesDeclFile.push(...fe.refs);
    const targets = new Set(fe.exactTargets);
    for (const re of reexportEdges) targets.add(`${re.toPath}\0${re.toName}`);
    exactTargets.set(m.path, targets);
  }

  const coverage = computeCoverage({
    imports,
    bindings,
    exportFailures,
    edges,
    tsconfigFailures: resolver.tsconfigFailures(),
  });

  return { imports, exports: exportsOut, symbols, edges, fileEdges, coverage, referencesDeclFile, bindings, exactTargets };
}
