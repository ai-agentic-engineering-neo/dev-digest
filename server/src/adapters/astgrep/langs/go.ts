/**
 * Go language module — tree-sitter-Go extraction via @ast-grep/lang-go.
 *
 * Structurally different from `./typescript.ts`, not just a different set of
 * kind-name synonyms — see the design note in
 * `docs/go-language-support-plan.md`'s "Implementation notes" section:
 *
 *   - "exported" is a NAMING CONVENTION in Go (`/^[A-Z]/` on the identifier),
 *     not an AST fact — there's no `export` keyword node to unwrap, so none
 *     of TS/JS's `unwrapExport`/re-export-back-patch machinery applies here.
 *   - Member access is `selector_expression{operand,field}`, not
 *     `member_expression{object,property}` — different field names, not a
 *     lookup-table-swappable kind synonym.
 *   - Methods carry their "class" via a `receiver` field
 *     (`func (r *Foo) Bar()`), unwrapped through at most one `pointer_type`
 *     level to the receiver's type name — Go's analogue of a class name for
 *     the existing `Type.Method` + bare `Method` dual-emit convention.
 *
 * Field names below were read directly from `@ast-grep/lang-go`'s own
 * `node-types.json`, not guessed.
 */
import { parse, registerDynamicLanguage, type SgNode } from '@ast-grep/napi';
import goLang from '@ast-grep/lang-go';
import { extname } from 'node:path';
import {
  childrenOfKind,
  dedupeSymbols,
  endLineOf,
  getField,
  headSignature,
  isInsideKind,
  lineOf,
  type ParsedImport,
  type ParsedInvocationHead,
  type ParsedReference,
  type ParsedSymbol,
} from '../shared.js';

/** The key `go` is registered under — also what `parse()` expects as `lang`. */
export const GO_LANG = 'go';
const IMPORT_KIND = 'import_declaration';

// registerDynamicLanguage is documented as callable exactly once per process.
// Module-level top-level call — ESM's module cache guarantees this file's
// body runs once regardless of how many places import it.
registerDynamicLanguage({ [GO_LANG]: goLang });

export function langForFile(file: string): typeof GO_LANG | null {
  return extname(file).toLowerCase() === '.go' ? GO_LANG : null;
}

/** Go's exported-ness is a naming convention, not an AST fact. */
function isExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** Receiver's type name for a method_declaration, unwrapping one pointer_type
 *  level (`(r *Foo)` → `Foo`; `(r Foo)` → `Foo`). Null for anything unexpected
 *  (multi-name receivers don't exist in Go — a receiver is always exactly one
 *  parameter). */
function receiverTypeName(method: SgNode): string | null {
  const receiver = getField(method, 'receiver');
  if (!receiver) return null;
  const param = childrenOfKind(receiver, 'parameter_declaration')[0];
  if (!param) return null;
  let type = getField(param, 'type');
  if (type?.kind() === 'pointer_type') {
    // pointer_type's children are the literal `*` token AND the underlying
    // type — [0] is the `*`, not the type. Filter by kind, don't assume position.
    type = type.children().find((c) => c.kind() === 'type_identifier') ?? null;
  }
  return type?.kind() === 'type_identifier' ? type.text() : null;
}

/** `type_spec` nodes under a `type_declaration` — works for both the single
 *  form (`type Foo struct{}`, spec is a direct child) and the grouped form
 *  (`type ( Foo struct{}; Bar interface{} )`, specs are still direct
 *  children — the parens are punctuation siblings, not a wrapper node). */
function typeSpecsOf(decl: SgNode): SgNode[] {
  return childrenOfKind(decl, 'type_spec');
}

/** `import_spec` nodes under an `import_declaration` — direct for a single
 *  import, nested one level inside `import_spec_list` for the grouped
 *  `import (...)` form. */
function importSpecsOf(decl: SgNode): SgNode[] {
  const direct = childrenOfKind(decl, 'import_spec');
  if (direct.length > 0) return direct;
  const list = childrenOfKind(decl, 'import_spec_list')[0];
  return list ? childrenOfKind(list, 'import_spec') : [];
}

/** Best-effort binding name when an import has no explicit alias — Go's
 *  implicit default is the last path segment as the package identifier.
 *  Doesn't handle the real package name possibly differing from the path's
 *  last segment, or dot-imports binding every exported name — v1
 *  simplification, documented in the plan. */
function defaultBindingName(importPath: string): string {
  const parts = importPath.split('/');
  return parts[parts.length - 1] || importPath;
}

// ---------------------------------------------------------------------------
// parseSymbols
// ---------------------------------------------------------------------------

export function parseSymbols(file: string, source: string): ParsedSymbol[] {
  if (!langForFile(file)) return [];

  const root = parse(GO_LANG, source).root();
  const out: ParsedSymbol[] = [];

  for (const top of root.children()) {
    handleTopLevel(top, out);
  }

  return dedupeSymbols(out);
}

function handleTopLevel(node: SgNode, out: ParsedSymbol[]): void {
  switch (node.kind()) {
    case 'function_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name) return;
      out.push({
        name,
        kind: 'function',
        line: lineOf(node),
        endLine: endLineOf(node),
        exported: isExported(name),
        signature: headSignature(node),
      });
      return;
    }
    case 'method_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name) return;
      const receiver = receiverTypeName(node);
      const mline = lineOf(node);
      const mend = endLineOf(node);
      const sig = headSignature(node);
      const exported = isExported(name);
      // Dual-emit qualified + bare, mirroring TS/JS's Class.method convention
      // — only when we actually resolved a receiver type; otherwise emit bare.
      if (receiver) {
        out.push({ name: `${receiver}.${name}`, kind: 'method', line: mline, endLine: mend, exported, signature: sig });
      }
      out.push({ name, kind: 'method', line: mline, endLine: mend, exported, signature: sig });
      return;
    }
    case 'type_declaration': {
      for (const spec of typeSpecsOf(node)) {
        const name = getField(spec, 'name')?.text();
        if (!name) continue;
        const typeNode = getField(spec, 'type');
        const symKind =
          typeNode?.kind() === 'struct_type' ? 'class' :
          typeNode?.kind() === 'interface_type' ? 'interface' :
          'type';
        out.push({
          name,
          kind: symKind,
          line: lineOf(spec),
          endLine: endLineOf(spec),
          exported: isExported(name),
          signature: headSignature(spec),
        });
      }
      return;
    }
    case 'const_declaration':
    case 'var_declaration': {
      // Only symbol-worthy when the value is a func literal (mirrors TS/JS's
      // "only a symbol when the value is fn-like" rule). Multi-name specs
      // (`var a, b = f, g`) — field('name') returns the first name only;
      // documented v1 simplification.
      const specKind = node.kind() === 'const_declaration' ? 'const_spec' : 'var_spec';
      for (const spec of childrenOfKind(node, specKind)) {
        const name = getField(spec, 'name')?.text();
        if (!name) continue;
        const value = getField(spec, 'value');
        if (value?.kind() !== 'func_literal') continue;
        out.push({
          name,
          kind: 'function',
          line: lineOf(spec),
          endLine: endLineOf(spec),
          exported: isExported(name),
          signature: headSignature(spec),
        });
      }
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// parseReferences / parseInvocationHeads
// ---------------------------------------------------------------------------

/** Resolve a call_expression's callee name. `identifier` → bare call (this
 *  already covers `new(T)`, a plain call in Go — no special-casing needed).
 *  `selector_expression` → the field name (Go's analogue of a member call). */
function calleeName(fn: SgNode): string | null {
  if (fn.kind() === 'identifier') return fn.text();
  if (fn.kind() === 'selector_expression') {
    return getField(fn, 'field')?.text() ?? null;
  }
  return null;
}

export function parseReferences(file: string, source: string): ParsedReference[] {
  if (!langForFile(file)) return [];

  const root = parse(GO_LANG, source).root();

  const declLines = new Set<string>();
  for (const sym of parseSymbols(file, source)) {
    declLines.add(`${sym.name}:${sym.line}`);
  }

  const out: ParsedReference[] = [];
  const dedup = new Set<string>();
  const push = (name: string, line: number) => {
    if (declLines.has(`${name}:${line}`)) return;
    const key = `${name}:${line}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    out.push({ toSymbol: name, line, refFile: file });
  };

  for (const n of root.findAll({ rule: { kind: 'call_expression' } })) {
    if (isInsideKind(n, IMPORT_KIND)) continue;
    const fn = getField(n, 'function');
    if (!fn) continue;
    const name = calleeName(fn);
    if (name) push(name, lineOf(n));
  }

  return out;
}

/**
 * Bare-identifier invocation heads only — same precision reasoning as the
 * TS/JS module: `x.Foo()` (selector-expression calls) are skipped on purpose
 * because resolving `Foo` without type info would be a false-positive
 * factory. No JSX equivalent — Go has none.
 */
export function parseInvocationHeads(file: string, source: string): ParsedInvocationHead[] {
  if (!langForFile(file)) return [];

  const root = parse(GO_LANG, source).root();
  const out: ParsedInvocationHead[] = [];
  const dedup = new Set<string>();

  for (const n of root.findAll({ rule: { kind: 'call_expression' } })) {
    if (isInsideKind(n, IMPORT_KIND)) continue;
    const fn = getField(n, 'function');
    if (fn?.kind() !== 'identifier') continue;
    const name = fn.text();
    const line = lineOf(n);
    const key = `${name}:${line}:call`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    out.push({ name, line, kind: 'call' });
  }

  return out;
}

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

export function parseImports(file: string, source: string): ParsedImport[] {
  if (!langForFile(file)) return [];

  const root = parse(GO_LANG, source).root();
  const out: ParsedImport[] = [];

  for (const decl of root.findAll({ rule: { kind: 'import_declaration' } })) {
    for (const spec of importSpecsOf(decl)) {
      const pathNode = getField(spec, 'path');
      if (!pathNode) continue;
      const sourceStr = pathNode.text().replace(/^['"`]|['"`]$/g, '');
      const nameNode = getField(spec, 'name');
      const name = nameNode ? nameNode.text() : defaultBindingName(sourceStr);
      out.push({ name, source: sourceStr, isType: false });
    }
  }

  return out;
}
