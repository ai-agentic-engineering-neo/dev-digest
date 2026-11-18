/**
 * Symbol edges (AC-9…AC-13). Exact edges ONLY via an import binding of the
 * source file or a same-file declaration (AC-11); `x.m` is `inferred` only
 * when exactly one method `m` exists among classes/interfaces bound in the
 * file (AC-12); everything else produces no edge.
 */
import { MODULE_SYMBOL, type ModuleReference } from '../../../domain/module-facts.js';
import type { BindingContext, FileIndex } from './bindings.js';
import type { Binding, BindingRecord, ReferenceDecl, SymbolEdgeRow } from './types.js';

export interface FileEdgesResult {
  edges: SymbolEdgeRow[];
  refs: ReferenceDecl[];
  /** `toPath\0toName` targets this file may legitimately hit with an exact edge. */
  exactTargets: Set<string>;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

const REF_EDGE_KIND = {
  call: 'call',
  value: 'value',
  type: 'type',
  extends: 'extends',
  implements: 'implements',
} as const;

export function buildFileEdges(
  ctx: BindingContext,
  fi: FileIndex,
  bindings: BindingRecord[],
): FileEdgesResult {
  const edges: SymbolEdgeRow[] = [];
  const refs: ReferenceDecl[] = [];
  const exactTargets = new Set<string>();
  const seen = new Set<string>();

  // localName → binding (first import wins, as in indexFile).
  const byLocal = new Map<string, Binding>();
  for (const b of bindings) if (b.localName && !byLocal.has(b.localName)) byLocal.set(b.localName, b.binding);

  const symbolsOfFile = new Set(fi.facts.symbols.map((s) => s.name));

  // Classes/interfaces bound in this file (imported or declared) → member candidates.
  const boundClasses = new Map<string, { file: string; cls: string }>();
  const addClass = (file: string, cls: string): void => {
    boundClasses.set(`${file}\0${cls}`, { file, cls });
  };
  for (const [name, sym] of fi.declared) if (sym.kind === 'class' || sym.kind === 'interface') addClass(fi.path, name);
  for (const b of byLocal.values()) {
    if (b.kind === 'symbol' && (b.symbolKind === 'class' || b.symbolKind === 'interface')) addClass(b.file, b.symbol);
  }
  // method name → distinct `file\0Class.method` among bound classes
  const methodCandidates = new Map<string, Map<string, { file: string; name: string }>>();
  for (const { file, cls } of boundClasses.values()) {
    const target = ctx.file(file);
    if (!target) continue;
    const prefix = `${cls}.`;
    for (const n of target.symbolNames) {
      if (!n.startsWith(prefix)) continue;
      const m = n.slice(prefix.length);
      if (m.includes('.')) continue;
      let c = methodCandidates.get(m);
      if (!c) methodCandidates.set(m, (c = new Map()));
      c.set(`${file}\0${n}`, { file, name: n });
    }
  }

  const push = (
    from: string,
    to: { file: string; name: string },
    kind: SymbolEdgeRow['kind'],
    confidence: SymbolEdgeRow['confidence'],
    line: number,
  ): void => {
    if (from === to.name && fi.path === to.file) return; // self-reference (recursion / own declaration)
    const key = `${from}\0${to.file}\0${to.name}\0${kind}\0${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ fromPath: fi.path, fromName: from, toPath: to.file, toName: to.name, kind, confidence, line });
    if (confidence === 'exact') exactTargets.add(`${to.file}\0${to.name}`);
  };

  /** Resolve a bare identifier to its exact target (import binding first, then same-file declaration). */
  const resolveIdent = (name: string): { target?: { file: string; name: string }; ns?: string; external?: boolean } => {
    const b = byLocal.get(name);
    if (b) {
      if (b.kind === 'symbol') return { target: { file: b.file, name: b.symbol } };
      if (b.kind === 'namespace') return { ns: b.file };
      if (b.kind === 'external' || b.kind === 'builtin') return { external: true };
      return {};
    }
    if (fi.declared.has(name)) return { target: { file: fi.path, name } };
    return {};
  };

  const record = (r: ModuleReference, declFile: string | null, via: ReferenceDecl['via']): void => {
    refs.push({ file: fi.path, name: r.name, line: r.line, declFile, via });
  };

  for (const r of fi.facts.references) {
    const from = symbolsOfFile.has(r.enclosing) || r.enclosing === MODULE_SYMBOL ? r.enclosing : MODULE_SYMBOL;
    const receiverIdent = r.receiver !== null && IDENT.test(r.receiver) ? r.receiver : null;

    // --- qualified / member through a namespace import: `ns.fn`, `ns.T` ⇒ exact ---
    if (receiverIdent) {
      const rid = resolveIdent(receiverIdent);
      if (rid.ns !== undefined) {
        const b = ctx.lookupExport(rid.ns, r.name);
        if (b.kind === 'symbol') {
          const kind =
            r.kind === 'member' ? (r.isCall ? 'call' : 'value') : REF_EDGE_KIND[r.kind as keyof typeof REF_EDGE_KIND];
          push(from, { file: b.file, name: b.symbol }, kind, 'exact', r.line);
          record(r, b.file, 'exact');
        } else {
          record(r, null, b.kind === 'external' || b.kind === 'builtin' ? 'external' : 'unresolved');
        }
        continue;
      }
    }

    // --- plain identifier reference ---
    if (r.kind !== 'member' && r.receiver === null) {
      const id = resolveIdent(r.name);
      if (id.target) {
        push(from, id.target, REF_EDGE_KIND[r.kind], 'exact', r.line);
        record(r, id.target.file, 'exact');
      } else {
        record(r, null, id.external ? 'external' : 'unresolved');
      }
      continue;
    }

    // --- member `x.m` ---
    if (r.kind === 'member') {
      const kind = r.isCall ? 'call' : 'value';
      // The receiver itself is a binding (`Svc.make()`): the value usage of that binding is exact.
      if (receiverIdent) {
        const rid = resolveIdent(receiverIdent);
        if (rid.target) push(from, rid.target, 'value', 'exact', r.line);
      }
      const cands = methodCandidates.get(r.name);
      if (cands && cands.size === 1) {
        const t = [...cands.values()][0]!;
        push(from, t, kind, 'inferred', r.line);
        record(r, t.file, 'inferred');
      } else {
        record(r, null, 'unresolved');
      }
      continue;
    }

    // qualified non-member with a non-namespace receiver (`a.b.T`, `Enum.X` as type): no edge
    record(r, null, 'unresolved');
  }

  return { edges, refs, exactTargets };
}
