/**
 * Binding resolution (AC-8): follow `export … from` / `export *` /
 * `export * as ns` chains from an import to the declaring symbol.
 * Pure: the resolver is injected, nothing touches disk or DB.
 */
import { MODULE_SYMBOL, type ModuleExport, type ModuleFacts, type ModuleImport, type ModuleSymbol } from '../../../domain/module-facts.js';
import type { ModuleResolution, ModuleResolverInstance } from '../../../domain/ports/module-resolver.js';
import type { Binding, ParsedModule } from './types.js';

export interface FileIndex {
  path: string;
  facts: ModuleFacts;
  /** Top-level declarations by bare name (members `C.m` and `<module>` excluded). */
  declared: Map<string, ModuleSymbol>;
  /** All symbol names incl. members — to check `Class.method` existence. */
  symbolNames: Set<string>;
  /** `exportedName` → non-star exports (a name can appear once per kind). */
  exportsByName: Map<string, ModuleExport[]>;
  reexportAll: ModuleExport[];
  importByLocal: Map<string, { imp: ModuleImport; idx: number }>;
}

export interface BindingContext {
  file(path: string): FileIndex | undefined;
  resolveSpecifier(from: string, specifier: string): ModuleResolution;
  /** Declaring symbol (or namespace/unresolved) of `name` as exported from `file`. */
  lookupExport(file: string, name: string): Binding;
  /** Resolve one import record of `from` to a binding. */
  bindImport(from: string, imp: ModuleImport): Binding;
}

export function indexFile(m: ParsedModule): FileIndex {
  const declared = new Map<string, ModuleSymbol>();
  const symbolNames = new Set<string>();
  for (const s of m.facts.symbols) {
    symbolNames.add(s.name);
    if (s.name === MODULE_SYMBOL || s.name.includes('.')) continue;
    if (!declared.has(s.name)) declared.set(s.name, s);
  }
  const exportsByName = new Map<string, ModuleExport[]>();
  const reexportAll: ModuleExport[] = [];
  for (const e of m.facts.exports) {
    if (e.kind === 'reexport_all') {
      reexportAll.push(e);
      continue;
    }
    const list = exportsByName.get(e.exportedName);
    if (list) list.push(e);
    else exportsByName.set(e.exportedName, [e]);
  }
  const importByLocal = new Map<string, { imp: ModuleImport; idx: number }>();
  m.facts.imports.forEach((imp, idx) => {
    if (imp.localName && !importByLocal.has(imp.localName)) importByLocal.set(imp.localName, { imp, idx });
  });
  return { path: m.path, facts: m.facts, declared, symbolNames, exportsByName, reexportAll, importByLocal };
}

function fromResolution(r: ModuleResolution): Binding | { kind: 'file'; path: string } {
  switch (r.kind) {
    case 'file':
      return { kind: 'file', path: r.path };
    case 'external':
      return { kind: 'external' };
    case 'builtin':
      return { kind: 'builtin' };
    default:
      return { kind: 'unresolved', reason: r.reason, file: null };
  }
}

const bindingKey = (b: Binding): string =>
  b.kind === 'symbol' ? `s\0${b.file}\0${b.symbol}` : b.kind === 'namespace' ? `n\0${b.file}` : b.kind;

export function createBindingContext(modules: ParsedModule[], resolver: ModuleResolverInstance): BindingContext {
  const files = new Map<string, FileIndex>();
  for (const m of modules) files.set(m.path, indexFile(m));
  const specCache = new Map<string, ModuleResolution>();

  const resolveSpecifier = (from: string, specifier: string): ModuleResolution => {
    const key = `${from}\0${specifier}`;
    let r = specCache.get(key);
    if (!r) {
      r = resolver.resolve(from, specifier);
      specCache.set(key, r);
    }
    return r;
  };

  const symbolAt = (file: string, symbol: string): Binding => ({
    kind: 'symbol',
    file,
    symbol,
    symbolKind: files.get(file)?.declared.get(symbol)?.kind ?? null,
  });

  /** Follow a re-export source: specifier → file → lookup(name). */
  const viaSpecifier = (from: string, specifier: string | null, name: string, stack: Set<string>): Binding => {
    if (specifier === null) return { kind: 'unresolved', reason: 'non_literal', file: null };
    const t = fromResolution(resolveSpecifier(from, specifier));
    if (t.kind !== 'file') return t;
    return lookup(t.path, name, stack);
  };

  const fromExport = (fi: FileIndex, e: ModuleExport, stack: Set<string>): Binding => {
    switch (e.kind) {
      case 'local':
      case 'default': {
        const ln = e.localName ?? e.exportedName;
        if (fi.declared.has(ln)) return symbolAt(fi.path, ln);
        const imp = fi.importByLocal.get(ln);
        if (imp) return bindImportInner(fi.path, imp.imp, stack);
        // `export { x }` with `x` neither declared nor imported here: there is no
        // (file, x) symbol to point an edge at — unresolved `missing`, counted in coverage.
        return { kind: 'unresolved', reason: 'missing', file: fi.path };
      }
      case 'reexport':
        return viaSpecifier(fi.path, e.specifier, e.localName ?? e.exportedName, stack);
      case 'namespace': {
        if (e.specifier === null) return { kind: 'unresolved', reason: 'non_literal', file: null };
        const t = fromResolution(resolveSpecifier(fi.path, e.specifier));
        return t.kind === 'file' ? { kind: 'namespace', file: t.path } : t;
      }
      default:
        return { kind: 'unresolved', reason: 'missing', file: fi.path };
    }
  };

  const lookup = (file: string, name: string, stack: Set<string>): Binding => {
    const key = `${file}\0${name}`;
    if (stack.has(key)) return { kind: 'unresolved', reason: 'cycle', file };
    const fi = files.get(file);
    if (!fi) return { kind: 'opaque', file };
    stack.add(key);
    try {
      const direct = fi.exportsByName.get(name);
      if (direct?.length) {
        // Prefer a real declaration over a re-export of the same name.
        const e = direct.find((x) => x.kind === 'local' || x.kind === 'default') ?? direct[0]!;
        return fromExport(fi, e, stack);
      }
      if (name !== 'default' && fi.reexportAll.length) {
        const found = new Map<string, Binding>();
        let cycle = false;
        let external = false;
        let opaque = false;
        for (const e of fi.reexportAll) {
          const r = viaSpecifier(fi.path, e.specifier, name, stack);
          if (r.kind === 'symbol' || r.kind === 'namespace') found.set(bindingKey(r), r);
          else if (r.kind === 'unresolved' && r.reason === 'cycle') cycle = true;
          else if (r.kind === 'external' || r.kind === 'builtin') external = true;
          else if (r.kind === 'opaque') opaque = true;
        }
        if (found.size === 1) return [...found.values()][0]!;
        if (found.size > 1) return { kind: 'unresolved', reason: 'ambiguous', file };
        if (cycle) return { kind: 'unresolved', reason: 'cycle', file };
        if (external) return { kind: 'external' };
        if (opaque) return { kind: 'opaque', file };
      }
      return { kind: 'unresolved', reason: 'missing', file };
    } finally {
      stack.delete(key);
    }
  };

  const bindImportInner = (from: string, imp: ModuleImport, stack: Set<string>): Binding => {
    if (imp.specifier === null) return { kind: 'unresolved', reason: 'non_literal', file: null };
    const t = fromResolution(resolveSpecifier(from, imp.specifier));
    if (t.kind !== 'file') return t;
    if (imp.importedName === null) return { kind: 'opaque', file: t.path }; // side-effect: file edge only
    if (imp.importedName === '*') {
      return files.has(t.path) ? { kind: 'namespace', file: t.path } : { kind: 'opaque', file: t.path };
    }
    return lookup(t.path, imp.importedName, stack);
  };

  return {
    file: (p) => files.get(p),
    resolveSpecifier,
    lookupExport: (file, name) => lookup(file, name, new Set()),
    bindImport: (from, imp) => bindImportInner(from, imp, new Set()),
  };
}
