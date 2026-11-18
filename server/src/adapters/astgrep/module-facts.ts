/**
 * Module facts — the pure, in-memory parse that feeds the dependency graph
 * (plan 19 / P1-B, specs/18-dependency-graph.md AC-1…AC-3, AC-9…AC-13).
 *
 * `parseModuleFacts(file, source)` returns, for ONE file: its import binding
 * table, its export table, its declarations (symbols) and its typed
 * references (with the enclosing declaration attributed). It does no I/O and
 * NO module resolution — specifiers are returned verbatim; resolving them is
 * the resolver's job (P1-C) and binding them to declarations is the graph
 * core's (P1-D).
 */
import { parse, Lang, type SgNode } from '@ast-grep/napi';

import {
  getField,
  isInsideImport,
  langForFile,
  lineOf,
  parseSymbols,
  type ParsedSymbol,
} from './index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

import { MODULE_SYMBOL, DEFAULT_SYMBOL } from '../../domain/module-facts.js';
import type { ModuleFacts, ModuleImport, ModuleImportKind, ModuleExport, ModuleExportKind, ModuleSymbol, ModuleReference, ModuleReferenceKind } from '../../domain/module-facts.js';

// Re-exported so existing importers of this adapter keep compiling.
export { MODULE_SYMBOL, DEFAULT_SYMBOL };
export type { ModuleFacts, ModuleImport, ModuleImportKind, ModuleExport, ModuleExportKind, ModuleSymbol, ModuleReference, ModuleReferenceKind };

const EMPTY: ModuleFacts = { imports: [], exports: [], symbols: [], references: [] };

// ---------------------------------------------------------------------------
// Small AST helpers
// ---------------------------------------------------------------------------

function sameNode(a: SgNode | null, b: SgNode): boolean {
  if (!a) return false;
  const ra = a.range();
  const rb = b.range();
  return ra.start.index === rb.start.index && ra.end.index === rb.end.index;
}

function kids(n: SgNode, kind: string): SgNode[] {
  return n.children().filter((c) => c.kind() === kind);
}

/** Literal string value (plain or substitution-free template), else null. */
function literalValue(n: SgNode | null | undefined): string | null {
  if (!n) return null;
  if (n.kind() === 'string') return n.text().slice(1, -1);
  if (n.kind() === 'template_string' && !n.children().some((c) => c.kind() === 'template_substitution')) {
    return n.text().slice(1, -1);
  }
  return null;
}

/** Binding identifiers of a destructuring / identifier pattern. */
function patternNames(n: SgNode | null | undefined): string[] {
  if (!n) return [];
  switch (n.kind()) {
    case 'identifier':
    case 'shorthand_property_identifier_pattern':
      return [n.text()];
    case 'object_pattern':
    case 'array_pattern':
    case 'rest_pattern':
      return n.children().flatMap(patternNames);
    case 'pair_pattern':
      return patternNames(getField(n, 'value'));
    case 'assignment_pattern':
    case 'object_assignment_pattern':
      return patternNames(getField(n, 'left'));
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/** `const x = <call>` / `const {a, b: c} = await <call>` => local/imported pairs. */
function bindingsOfCall(call: SgNode): Array<{ local: string; imported: string }> {
  let cur: SgNode = call;
  let parent = cur.parent();
  while (parent && (parent.kind() === 'await_expression' || parent.kind() === 'parenthesized_expression')) {
    cur = parent;
    parent = cur.parent();
  }
  if (!parent || parent.kind() !== 'variable_declarator' || !sameNode(getField(parent, 'value'), cur)) return [];
  const target = getField(parent, 'name');
  if (!target) return [];
  if (target.kind() === 'identifier') return [{ local: target.text(), imported: '*' }];
  if (target.kind() === 'object_pattern') {
    const out: Array<{ local: string; imported: string }> = [];
    for (const c of target.children()) {
      if (c.kind() === 'shorthand_property_identifier_pattern') out.push({ local: c.text(), imported: c.text() });
      else if (c.kind() === 'pair_pattern') {
        const key = getField(c, 'key')?.text();
        const local = patternNames(getField(c, 'value'))[0];
        if (key && local) out.push({ local, imported: key });
      }
    }
    return out;
  }
  return [];
}

function collectImports(root: SgNode): ModuleImport[] {
  const out: ModuleImport[] = [];

  for (const stmt of root.findAll({ rule: { kind: 'import_statement' } })) {
    const line = lineOf(stmt);
    const specifier = literalValue(getField(stmt, 'source'));
    const topType = stmt.children().some((c) => c.kind() === 'type');
    const base = { specifier, kind: 'static' as const, nonLiteral: false, line };

    // `import x = require('y')`
    const req = kids(stmt, 'import_require_clause')[0];
    if (req) {
      const local = req.children().find((c) => c.kind() === 'identifier')?.text() ?? null;
      const spec = literalValue(req.children().find((c) => c.kind() === 'string'));
      out.push({ localName: local, importedName: '*', specifier: spec, isType: topType, kind: 'require', nonLiteral: spec === null, line });
      continue;
    }

    const clause = kids(stmt, 'import_clause')[0];
    if (!clause) {
      out.push({ ...base, localName: null, importedName: null, isType: false }); // side-effect
      continue;
    }
    for (const c of clause.children()) {
      if (c.kind() === 'identifier') {
        out.push({ ...base, localName: c.text(), importedName: 'default', isType: topType });
      } else if (c.kind() === 'namespace_import') {
        const id = c.children().find((x) => x.kind() === 'identifier');
        if (id) out.push({ ...base, localName: id.text(), importedName: '*', isType: topType });
      } else if (c.kind() === 'named_imports') {
        for (const spec of kids(c, 'import_specifier')) {
          const imported = getField(spec, 'name')?.text();
          if (!imported) continue;
          const local = getField(spec, 'alias')?.text() ?? imported;
          const inlineType = spec.children().some((x) => x.kind() === 'type');
          out.push({ ...base, localName: local, importedName: imported, isType: topType || inlineType });
        }
      }
    }
  }

  for (const call of root.findAll({ rule: { kind: 'call_expression' } })) {
    const fn = getField(call, 'function');
    if (!fn) continue;
    const isDynamic = fn.kind() === 'import';
    const isRequire = fn.kind() === 'identifier' && fn.text() === 'require';
    if (!isDynamic && !isRequire) continue;
    const args = getField(call, 'arguments');
    const first = args?.children().find((c) => c.kind() !== '(' && c.kind() !== ')' && c.kind() !== ',');
    const spec = literalValue(first);
    const kind: ModuleImportKind = isDynamic ? 'dynamic' : 'require';
    const line = lineOf(call);
    if (spec === null) {
      out.push({ localName: null, importedName: null, specifier: null, isType: false, kind, nonLiteral: true, line });
      continue;
    }
    const bound = bindingsOfCall(call);
    if (bound.length === 0) {
      out.push({ localName: null, importedName: '*', specifier: spec, isType: false, kind, nonLiteral: false, line });
    } else {
      for (const b of bound) {
        out.push({ localName: b.local, importedName: b.imported, specifier: spec, isType: false, kind, nonLiteral: false, line });
      }
    }
  }

  return out.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// Exports + symbols
// ---------------------------------------------------------------------------

const EXPORT_SKIP_KINDS = new Set(['export', 'default', '*', 'from', ';', 'string', 'export_clause', 'namespace_export', 'type', 'decorator', '=']);

/** Declaration node carried by an `export` statement (unwrapping `declare`). */
function exportedDecl(stmt: SgNode): SgNode | null {
  for (const c of stmt.children()) {
    if (EXPORT_SKIP_KINDS.has(c.kind() as string)) continue;
    if (c.kind() === 'ambient_declaration') {
      return c.children().find((x) => x.kind() !== 'declare') ?? null;
    }
    return c;
  }
  return null;
}

function declNames(decl: SgNode): Array<{ name: string; isType: boolean }> {
  switch (decl.kind()) {
    case 'function_declaration':
    case 'generator_function_declaration':
    case 'function_signature':
    case 'class_declaration':
    case 'abstract_class_declaration':
    case 'enum_declaration':
    case 'internal_module':
    case 'module': {
      const n = getField(decl, 'name')?.text();
      return n ? [{ name: n, isType: false }] : [];
    }
    case 'interface_declaration':
    case 'type_alias_declaration': {
      const n = getField(decl, 'name')?.text();
      return n ? [{ name: n, isType: true }] : [];
    }
    case 'lexical_declaration':
    case 'variable_declaration':
      return kids(decl, 'variable_declarator').flatMap((d) =>
        patternNames(getField(d, 'name')).map((name) => ({ name, isType: false })),
      );
    default:
      return [];
  }
}

function collectExports(root: SgNode): { exports: ModuleExport[]; anonymousDefault: SgNode | null } {
  const out: ModuleExport[] = [];
  let anonymousDefault: SgNode | null = null;

  for (const stmt of root.children()) {
    if (stmt.kind() !== 'export_statement') continue;
    const line = lineOf(stmt);
    const kinds = stmt.children().map((c) => c.kind());
    const spec = literalValue(stmt.children().find((c) => c.kind() === 'string'));
    const isTypeStmt = kinds.includes('type');
    const hasFrom = kinds.includes('from');

    const clause = kids(stmt, 'export_clause')[0];
    const nsExport = kids(stmt, 'namespace_export')[0];

    if (clause) {
      for (const es of kids(clause, 'export_specifier')) {
        const local = getField(es, 'name')?.text();
        if (!local) continue;
        const exported = getField(es, 'alias')?.text() ?? local;
        const inlineType = es.children().some((x) => x.kind() === 'type');
        const isType = isTypeStmt || inlineType;
        if (hasFrom) {
          out.push({ exportedName: exported, localName: local, kind: 'reexport', specifier: spec, isType, line });
        } else {
          out.push({
            exportedName: exported,
            localName: local,
            kind: exported === 'default' ? 'default' : 'local',
            specifier: null,
            isType,
            line,
          });
        }
      }
      continue;
    }
    if (nsExport) {
      const ns = nsExport.children().find((c) => c.kind() === 'identifier')?.text();
      if (ns) out.push({ exportedName: ns, localName: null, kind: 'namespace', specifier: spec, isType: isTypeStmt, line });
      continue;
    }
    if (kinds.includes('*') && hasFrom) {
      out.push({ exportedName: '*', localName: null, kind: 'reexport_all', specifier: spec, isType: isTypeStmt, line });
      continue;
    }

    if (kinds.includes('default')) {
      const value = stmt.children().find((c) => !EXPORT_SKIP_KINDS.has(c.kind() as string));
      if (!value) continue;
      let local: string | null = null;
      let isType = false;
      switch (value.kind()) {
        case 'identifier':
          local = value.text();
          break;
        case 'function_declaration':
        case 'generator_function_declaration':
        case 'class_declaration':
        case 'abstract_class_declaration':
          local = getField(value, 'name')?.text() ?? null;
          break;
        case 'interface_declaration':
          local = getField(value, 'name')?.text() ?? null;
          isType = true;
          break;
        case 'function_expression':
        case 'class':
        case 'generator_function':
          local = getField(value, 'name')?.text() ?? null;
          if (!local) anonymousDefault = value;
          break;
        default:
          anonymousDefault = value; // arrow function / object / call / literal …
      }
      out.push({ exportedName: 'default', localName: local ?? DEFAULT_SYMBOL, kind: 'default', specifier: null, isType, line });
      continue;
    }

    const decl = exportedDecl(stmt);
    if (!decl) continue;
    for (const { name, isType } of declNames(decl)) {
      out.push({ exportedName: name, localName: name, kind: 'local', specifier: null, isType, line });
    }
  }

  return { exports: out, anonymousDefault };
}

/** TS/TSX grammars (JSX is parsed with TSX) know type-level node kinds; JS does not. */
function isTsGrammar(lang: Lang): boolean {
  return lang === Lang.TypeScript || lang === Lang.Tsx;
}

/** Interface members (`Iface.method`), so member calls can be attributed. */
function interfaceMembers(root: SgNode): ModuleSymbol[] {
  const out: ModuleSymbol[] = [];
  for (const iface of root.findAll({ rule: { kind: 'interface_declaration' } })) {
    if (iface.parent()?.kind() !== 'program' && iface.parent()?.kind() !== 'export_statement' && iface.parent()?.kind() !== 'ambient_declaration') continue;
    const name = getField(iface, 'name')?.text();
    const body = getField(iface, 'body');
    if (!name || !body) continue;
    const exported = iface.parent()?.kind() === 'export_statement';
    for (const m of body.children()) {
      if (m.kind() !== 'method_signature') continue;
      const mname = getField(m, 'name')?.text();
      if (!mname) continue;
      out.push({
        name: `${name}.${mname}`,
        kind: 'method',
        line: lineOf(m),
        endLine: m.range().end.line + 1,
        exported,
        signature: m.text().replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
  }
  return out;
}

/** Collapse overloads / declaration merging: one row per name. */
function collapse(syms: ModuleSymbol[]): ModuleSymbol[] {
  const byName = new Map<string, ModuleSymbol>();
  for (const s of syms) {
    const prior = byName.get(s.name);
    if (!prior) {
      byName.set(s.name, { ...s });
      continue;
    }
    prior.line = Math.min(prior.line, s.line);
    prior.endLine = Math.max(prior.endLine, s.endLine);
    prior.exported = prior.exported || s.exported;
  }
  return [...byName.values()];
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

const IGNORED_IDENTIFIERS = new Set(['undefined', 'arguments', 'require', 'globalThis']);

/** Parent kinds whose identifier children are binding/declaration positions. */
function isBindingPosition(n: SgNode): boolean {
  const p = n.parent();
  if (!p) return false;
  const pk = p.kind();
  // `name` is a reference (not a declaration) on these parents.
  const nameIsUse = pk === 'nested_type_identifier' || pk === 'jsx_opening_element' || pk === 'jsx_self_closing_element';
  if (!nameIsUse && getField(p, 'name') && sameNode(getField(p, 'name'), n)) return true;
  switch (pk) {
    case 'import_specifier':
    case 'import_clause':
    case 'namespace_import':
    case 'export_specifier':
    case 'namespace_export':
    case 'import_require_clause':
    case 'rest_pattern':
    case 'array_pattern':
    case 'jsx_closing_element':
      return true;
    case 'required_parameter':
    case 'optional_parameter':
      return sameNode(getField(p, 'pattern'), n);
    case 'arrow_function':
      return sameNode(getField(p, 'parameter'), n);
    case 'catch_clause':
      return sameNode(getField(p, 'parameter'), n);
    case 'assignment_pattern':
    case 'object_assignment_pattern':
      return sameNode(getField(p, 'left'), n);
    case 'pair_pattern':
      return sameNode(getField(p, 'value'), n);
    default:
      return false;
  }
}

function isMemberChain(n: SgNode | null): boolean {
  if (!n) return false;
  if (n.kind() === 'identifier' || n.kind() === 'this') return true;
  if (n.kind() === 'member_expression') {
    return isMemberChain(getField(n, 'object'));
  }
  return false;
}

function collectReferences(root: SgNode, lang: Lang, dts: boolean, enclosing: (line: number) => string): ModuleReference[] {
  const out: ModuleReference[] = [];
  const seen = new Set<string>();
  const push = (r: Omit<ModuleReference, 'enclosing'>) => {
    // `.d.ts`: type edges only (AC-3 edge cases) — everything collapses to `type`.
    if (dts && (r.kind === 'call' || r.kind === 'value' || r.kind === 'member')) return;
    const kind: ModuleReferenceKind = dts ? 'type' : r.kind;
    const key = `${kind}|${r.name}|${r.receiver ?? ''}|${r.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...r, kind, enclosing: enclosing(r.line) });
  };

  // `type_identifier` exists only in the TypeScript grammars; the JS grammar
  // rejects the whole rule if it is listed.
  const kindsToVisit = isTsGrammar(lang)
    ? ['identifier', 'type_identifier', 'shorthand_property_identifier', 'member_expression']
    : ['identifier', 'shorthand_property_identifier', 'member_expression'];
  for (const n of root.findAll({ rule: { any: kindsToVisit.map((kind) => ({ kind })) } })) {
    if (isInsideImport(n)) continue;
    const line = lineOf(n);
    const kind = n.kind();
    const parent = n.parent();
    if (!parent) continue;

    if (kind === 'member_expression') {
      const object = getField(n, 'object');
      const prop = getField(n, 'property')?.text();
      if (!prop || !object || !isMemberChain(object)) continue;
      const receiver = object.text();
      if (receiver.length > 120 || receiver.includes('\n')) continue;
      if (parent.kind() === 'extends_clause') {
        push({ kind: 'extends', name: prop, receiver, line });
        continue;
      }
      const isCall =
        (parent.kind() === 'call_expression' && sameNode(getField(parent, 'function'), n)) ||
        (parent.kind() === 'new_expression' && sameNode(getField(parent, 'constructor'), n));
      push({ kind: 'member', name: prop, prop, receiver, isCall, line });
      continue;
    }

    if (kind === 'type_identifier') {
      if (isBindingPosition(n)) continue;
      if (parent.kind() === 'nested_type_identifier') {
        // `ns.T`: emit at the property side only.
        // The only `type_identifier` directly under `ns.T` is the name side.
        const mod = getField(parent, 'module')?.text() ?? parent.children()[0]?.text() ?? null;
        const gp = parent.parent();
        const k: ModuleReferenceKind = gp?.kind() === 'implements_clause' ? 'implements'
          : gp?.kind() === 'extends_type_clause' || gp?.kind() === 'extends_clause' ? 'extends' : 'type';
        push({ kind: k, name: n.text(), receiver: mod, line });
        continue;
      }
      const holder = parent.kind() === 'generic_type' ? parent.parent() : parent;
      const k: ModuleReferenceKind = holder?.kind() === 'implements_clause' ? 'implements'
        : holder?.kind() === 'extends_type_clause' || holder?.kind() === 'extends_clause' ? 'extends' : 'type';
      push({ kind: k, name: n.text(), receiver: null, line });
      continue;
    }

    // identifier / shorthand_property_identifier
    const name = n.text();
    if (IGNORED_IDENTIFIERS.has(name)) continue;
    if (kind === 'identifier') {
      if (isBindingPosition(n)) continue;
      if (parent.kind() === 'member_expression' && sameNode(getField(parent, 'object'), n)) continue; // covered by `member`
      if (parent.kind() === 'nested_type_identifier') continue;
      if (parent.kind() === 'jsx_opening_element' || parent.kind() === 'jsx_self_closing_element') {
        if (/^[a-z]/.test(name)) continue; // HTML element
        push({ kind: 'value', name, receiver: null, line });
        continue;
      }
      if (parent.kind() === 'extends_clause') {
        push({ kind: 'extends', name, receiver: null, line });
        continue;
      }
      if (
        (parent.kind() === 'call_expression' && sameNode(getField(parent, 'function'), n)) ||
        (parent.kind() === 'new_expression' && sameNode(getField(parent, 'constructor'), n))
      ) {
        push({ kind: 'call', name, receiver: null, line });
        continue;
      }
    }
    push({ kind: 'value', name, receiver: null, line });
  }
  void lang;
  return out.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function parseModuleFacts(file: string, source: string): ModuleFacts {
  const lang = langForFile(file);
  if (!lang) return { ...EMPTY, imports: [], exports: [], symbols: [], references: [] };

  const root = parse(lang, source).root();
  const totalLines = root.range().end.line + 1;
  const dts = /\.d\.ts$/i.test(file);

  const imports = collectImports(root);
  const { exports, anonymousDefault } = collectExports(root);

  // Symbols: v1 declarations (+ const/enum) with the bare method duplicates
  // dropped (`Class.method` is the key), interface members, anonymous default.
  const raw: ModuleSymbol[] = parseSymbols(file, source).filter((s) => !(s.kind === 'method' && !s.name.includes('.')));
  // `interface_declaration` exists only in the TypeScript grammars: asking the
  // JS grammar for it throws, which used to push every .js/.jsx file into
  // parse-degraded.
  if (isTsGrammar(lang)) raw.push(...interfaceMembers(root));
  if (anonymousDefault) {
    const fnLike = ['arrow_function', 'function_expression', 'generator_function'].includes(anonymousDefault.kind() as string);
    const cls = anonymousDefault.kind() === 'class';
    raw.push({
      name: DEFAULT_SYMBOL,
      kind: cls ? 'class' : fnLike ? 'function' : 'const',
      line: lineOf(anonymousDefault),
      endLine: anonymousDefault.range().end.line + 1,
      exported: true,
      signature: null,
    });
  }
  // `export {a as b}` / `export default a` mark the declaration as exported.
  const exportedLocals = new Set(exports.filter((e) => e.localName && (e.kind === 'local' || e.kind === 'default')).map((e) => e.localName!));
  for (const s of raw) if (exportedLocals.has(s.name)) s.exported = true;
  // `const Comment = model(...); export default Comment` — the plain value is
  // exported later, so parseSymbols (which keeps plain values only when the
  // declaration itself is exported) skipped it and every importer's binding
  // dangled. Pick such top-level declarations up here.
  const known = new Set(raw.map((s) => s.name));
  for (const stmt of root.children()) {
    if (stmt.kind() !== 'lexical_declaration' && stmt.kind() !== 'variable_declaration') continue;
    for (const d of kids(stmt, 'variable_declarator')) {
      const nameNode = getField(d, 'name');
      const name = nameNode?.kind() === 'identifier' ? nameNode.text() : null;
      if (!name || known.has(name) || !exportedLocals.has(name)) continue;
      known.add(name);
      raw.push({
        name,
        kind: 'const',
        line: lineOf(d),
        endLine: d.range().end.line + 1,
        exported: true,
        signature: stmt.text().replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
  }

  const symbols = collapse(raw);
  symbols.push({
    name: MODULE_SYMBOL,
    kind: 'module',
    line: 1,
    endLine: totalLines,
    exported: false,
    signature: null,
  });

  const enclosingOf = (line: number): string => {
    let best: ModuleSymbol | null = null;
    for (const s of symbols) {
      if (s.name === MODULE_SYMBOL || line < s.line || line > s.endLine) continue;
      if (!best || s.endLine - s.line <= best.endLine - best.line) best = s;
    }
    return best ? best.name : MODULE_SYMBOL;
  };

  const references = collectReferences(root, lang, dts, enclosingOf);
  return { imports, exports, symbols, references };
}
