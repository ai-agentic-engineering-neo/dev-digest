/**
 * Rebuild binding-context modules from the persisted graph rows (plan 19 /
 * P1-E, AC-18). The incremental run re-parses only the affected slice; every
 * other file contributes its stored imports / exports / symbols so the graph
 * core can still follow barrels and bind names across the whole repo. These
 * modules carry NO references — their edges are already persisted and are not
 * rewritten.
 */
import type { ModuleFacts } from '../../../domain/module-facts.js';
import type { ParsedModule } from '../graph/index.js';
import type { GraphContextRows } from '../repository.js';

export function contextModules(
  rows: GraphContextRows,
  exclude: ReadonlySet<string>,
): ParsedModule[] {
  const byPath = new Map<string, ModuleFacts>();
  const factsOf = (path: string): ModuleFacts => {
    let f = byPath.get(path);
    if (!f) byPath.set(path, (f = { imports: [], exports: [], symbols: [], references: [] }));
    return f;
  };

  // Only files that were actually parsed have a `<module>` symbol row.
  for (const s of rows.symbols) {
    if (exclude.has(s.path)) continue;
    // Bare-name method rows are v1 duplicates of `Class.method` — not graph keys.
    if (s.kind === 'method' && !s.name.includes('.')) continue;
    const line = s.line ?? 1;
    factsOf(s.path).symbols.push({
      name: s.name,
      kind: s.kind,
      line,
      endLine: s.endLine ?? line,
      exported: s.exported,
      signature: s.signature,
    } as ModuleFacts['symbols'][number]);
  }
  const known = new Set(byPath.keys());

  const imports = [...rows.imports].sort((a, b) => a.idx - b.idx);
  for (const r of imports) {
    if (!known.has(r.fromFile)) continue;
    factsOf(r.fromFile).imports.push({
      localName: r.localName === '' ? null : r.localName,
      importedName: r.importedName === '' ? null : r.importedName,
      specifier: r.specifier === '' ? null : r.specifier,
      isType: r.isType,
      kind: r.kind,
      nonLiteral: r.specifier === '' && r.kind !== 'static',
      line: r.line,
    });
  }
  for (const r of rows.exports) {
    if (!known.has(r.file)) continue;
    factsOf(r.file).exports.push({
      exportedName: r.exportedName,
      localName: r.localName,
      kind: r.kind,
      specifier: r.specifier,
      isType: false,
      line: r.line,
    });
  }
  return [...byPath.entries()].map(([path, facts]) => ({ path, facts }));
}
