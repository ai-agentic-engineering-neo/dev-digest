/**
 * TypeScript/JavaScript language module — tree-sitter-backed extraction.
 *
 * This is a close-to-verbatim extraction of what used to be the entire
 * `astgrep/index.ts` (the only language it ever supported), moved here so
 * `index.ts` can dispatch to it alongside `./go.ts`. Behavior is unchanged;
 * only the generic tree helpers moved to `../shared.ts`.
 *
 * Method symbols follow the legacy extractor's dual-emit convention: each
 * class method is emitted twice — once qualified (`Class.method`) and once
 * bare (`method`) — so reference search resolves both forms.
 */
import { parse, Lang, type SgNode } from '@ast-grep/napi';
import { extname } from 'node:path';
import { MAX_SIGNATURE_CHARS } from '../../../modules/repo-intel/constants.js';
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

/** TS/JS extension → ast-grep Lang, or null for anything outside this family. */
export function langForFile(file: string): Lang | null {
  const ext = extname(file).toLowerCase();
  switch (ext) {
    case '.ts':
      return Lang.TypeScript;
    case '.tsx':
      return Lang.Tsx;
    case '.jsx':
      // tree-sitter ships JSX inside the TSX grammar; the existing TS toolchain
      // happily parses JSX as TSX (the only difference is `<Foo>` cast syntax,
      // which Tsx rejects — fine for indexing).
      return Lang.Tsx;
    case '.js':
    case '.cjs':
    case '.mjs':
      return Lang.JavaScript;
    default:
      return null;
  }
}

/** JS keywords / common no-symbol identifiers — parity with extract.ts. */
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'await', 'typeof',
  'new', 'delete', 'void', 'do', 'else', 'in', 'of', 'instanceof', 'yield', 'super',
  'constructor', 'get', 'set', 'import', 'export', 'as', 'from', 'class', 'extends',
]);

const IMPORT_KIND = 'import_statement';

/** Leftmost identifier in a name node (`identifier` or `member_expression`). */
function leftmostName(n: SgNode | null | undefined): string | null {
  if (!n) return null;
  if (n.kind() === 'identifier' || n.kind() === 'type_identifier') return n.text();
  if (n.kind() === 'member_expression') {
    const obj = getField(n, 'object');
    return leftmostName(obj);
  }
  return null;
}

/** Rightmost identifier in a member expression (= the method/property name). */
function rightmostName(n: SgNode | null | undefined): string | null {
  if (!n) return null;
  if (n.kind() === 'identifier' || n.kind() === 'type_identifier') return n.text();
  if (n.kind() === 'property_identifier') return n.text();
  if (n.kind() === 'member_expression') {
    const prop = getField(n, 'property');
    return prop?.text() ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseSymbols
// ---------------------------------------------------------------------------

/**
 * Parse declarations in a single file's source. Method symbols are emitted
 * twice (qualified + bare) for parity with the regex extractor.
 */
export function parseSymbols(file: string, source: string): ParsedSymbol[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();
  const out: ParsedSymbol[] = [];
  const declLineByName = new Map<string, number>(); // for export-clause back-patching

  // Walk top-level: each child is either an export_statement (carrying a decl)
  // or a bare decl. Recurse only one level — nested declarations aren't part
  // of the "symbols" model.
  for (const top of root.children()) {
    const { node, exported } = unwrapExport(top);
    handleDecl(node, exported, out, declLineByName);
  }

  // Re-export pass: `export { foo, bar as baz }` upgrades previously-declared
  // local names to exported. Aliases aren't separate symbols; the original
  // decl carries the truth.
  for (const ex of root.findAll({ rule: { kind: 'export_statement' } })) {
    const clause = childrenOfKind(ex, 'export_clause')[0];
    if (!clause) continue;
    for (const spec of childrenOfKind(clause, 'export_specifier')) {
      const name = getField(spec, 'name')?.text();
      if (!name) continue;
      // mark every prior symbol with this name as exported
      for (const s of out) if (s.name === name && declLineByName.get(name) === s.line) s.exported = true;
    }
  }

  return dedupeSymbols(out);
}

/** Pull a child decl out of an `export_statement`; return exported flag. */
function unwrapExport(top: SgNode): { node: SgNode; exported: boolean } {
  if (top.kind() !== 'export_statement') return { node: top, exported: false };
  // Find the first non-keyword child (skip `export`, `default`, `*`, `from`, `;`).
  for (const c of top.children()) {
    const k = c.kind();
    if (k === 'export' || k === 'default' || k === '*' || k === 'from' || k === ';' || k === 'string' || k === 'export_clause') continue;
    return { node: c, exported: true };
  }
  return { node: top, exported: true };
}

function handleDecl(
  node: SgNode,
  exported: boolean,
  out: ParsedSymbol[],
  declLines: Map<string, number>,
): void {
  const kind = node.kind();
  switch (kind) {
    case 'function_declaration':
    case 'generator_function_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name || KEYWORDS.has(name)) return;
      out.push({
        name,
        kind: 'function',
        line: lineOf(node),
        endLine: endLineOf(node),
        exported,
        signature: headSignature(node),
      });
      declLines.set(name, lineOf(node));
      return;
    }
    case 'class_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name || KEYWORDS.has(name)) return;
      const classLine = lineOf(node);
      out.push({
        name,
        kind: 'class',
        line: classLine,
        endLine: endLineOf(node),
        exported,
        signature: headSignature(node),
      });
      declLines.set(name, classLine);
      // Walk class body for methods. Match `Class.method` AND bare `method`.
      const body = getField(node, 'body');
      if (body) {
        for (const m of body.children()) {
          if (m.kind() !== 'method_definition') continue;
          const mname = getField(m, 'name')?.text();
          if (!mname || KEYWORDS.has(mname)) continue;
          const mline = lineOf(m);
          const sig = headSignature(m);
          out.push({
            name: `${name}.${mname}`,
            kind: 'method',
            line: mline,
            endLine: endLineOf(m),
            exported, // method visibility tracks the class
            signature: sig,
          });
          out.push({
            name: mname,
            kind: 'method',
            line: mline,
            endLine: endLineOf(m),
            exported,
            signature: sig,
          });
          declLines.set(`${name}.${mname}`, mline);
          declLines.set(mname, mline);
        }
      }
      return;
    }
    case 'interface_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name || KEYWORDS.has(name)) return;
      out.push({
        name, kind: 'interface',
        line: lineOf(node), endLine: endLineOf(node),
        exported, signature: headSignature(node),
      });
      declLines.set(name, lineOf(node));
      return;
    }
    case 'type_alias_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name || KEYWORDS.has(name)) return;
      out.push({
        name, kind: 'type',
        line: lineOf(node), endLine: endLineOf(node),
        exported, signature: headSignature(node),
      });
      declLines.set(name, lineOf(node));
      return;
    }
    case 'enum_declaration': {
      const name = getField(node, 'name')?.text();
      if (!name || KEYWORDS.has(name)) return;
      out.push({
        name, kind: 'enum',
        line: lineOf(node), endLine: endLineOf(node),
        exported, signature: headSignature(node),
      });
      declLines.set(name, lineOf(node));
      return;
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      // `const foo = ...` / `let foo = ...` / `var foo = ...` — only treat as
      // a function-style symbol when the value is a fn-like (arrow, function
      // expression, async arrow, etc.). Plain values aren't symbols here.
      for (const decl of childrenOfKind(node, 'variable_declarator')) {
        const name = getField(decl, 'name')?.text();
        if (!name || KEYWORDS.has(name)) continue;
        const value = getField(decl, 'value');
        if (!isFunctionLike(value)) continue;
        out.push({
          name,
          kind: 'function',
          line: lineOf(decl),
          endLine: endLineOf(decl),
          exported,
          signature: headSignatureOfVariable(decl),
        });
        declLines.set(name, lineOf(decl));
      }
      return;
    }
    default:
      return;
  }
}

function isFunctionLike(n: SgNode | null | undefined): boolean {
  if (!n) return false;
  const k = n.kind();
  return k === 'arrow_function' || k === 'function_expression' || k === 'generator_function';
}

/**
 * For `const foo = (x) => ...`, build a signature like
 * `const foo = (x) =>` rather than just the arrow body.
 */
function headSignatureOfVariable(decl: SgNode): string {
  // Walk up to the enclosing lexical_declaration to capture the `const`/`let`
  // keyword too — better signal for callers reading the prompt.
  const parent = decl.parent();
  const base = parent && (parent.kind() === 'lexical_declaration' || parent.kind() === 'variable_declaration')
    ? parent
    : decl;
  const value = getField(decl, 'value');
  if (isFunctionLike(value)) {
    const valueBody = getField(value!, 'body');
    if (valueBody) {
      const offset = valueBody.range().start.index - base.range().start.index;
      let head = base.text().slice(0, offset);
      head = head.replace(/\s+/g, ' ').trim().replace(/(?:\s*=>|\s*\{|\s*=)\s*$/, '').trim();
      if (head.length > MAX_SIGNATURE_CHARS) head = head.slice(0, MAX_SIGNATURE_CHARS - 1) + '…';
      return head;
    }
  }
  return headSignature(base);
}

// ---------------------------------------------------------------------------
// parseReferences
// ---------------------------------------------------------------------------

/**
 * Collect call/usage sites. Mirrors extract.ts's intent:
 *   - `sym(`        → call_expression with identifier function
 *   - `.sym(`       → call_expression with member_expression function (use property)
 *   - `new Sym(`    → new_expression
 *   - `<Sym ...>`   → jsx_(opening|self_closing)_element (leftmost identifier)
 * Excludes:
 *   - identifiers inside import_statement subtrees
 *   - the declaration line itself (matched by name + line)
 */
export function parseReferences(file: string, source: string): ParsedReference[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();

  // Build a (name, line) set of declarations so we don't count the decl line.
  const declLines = new Set<string>();
  for (const sym of parseSymbols(file, source)) {
    declLines.add(`${sym.name}:${sym.line}`);
  }

  const out: ParsedReference[] = [];
  const dedup = new Set<string>();
  const push = (name: string, line: number) => {
    if (KEYWORDS.has(name)) return;
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
    if (fn.kind() === 'identifier') {
      push(fn.text(), lineOf(n));
    } else if (fn.kind() === 'member_expression') {
      const prop = rightmostName(fn);
      if (prop) push(prop, lineOf(n));
    }
  }

  for (const n of root.findAll({ rule: { kind: 'new_expression' } })) {
    if (isInsideKind(n, IMPORT_KIND)) continue;
    const ctor = getField(n, 'constructor');
    const name = rightmostName(ctor);
    if (name) push(name, lineOf(n));
  }

  // JSX kinds only exist in the Tsx grammar — guard so we don't ask the
  // TS/JS parsers about kinds they don't know.
  if (lang === Lang.Tsx) {
    for (const kind of ['jsx_opening_element', 'jsx_self_closing_element']) {
      for (const n of root.findAll({ rule: { kind } })) {
        if (isInsideKind(n, IMPORT_KIND)) continue;
        const nameNode = getField(n, 'name');
        // leftmost identifier of <Foo.Bar> → Foo (matches extract.ts `<Sym` head)
        const leftName = leftmostName(nameNode);
        if (!leftName) continue;
        // Skip lowercase HTML elements (`<div>`, `<span>`) — they're not refs.
        if (/^[a-z]/.test(leftName)) continue;
        push(leftName, lineOf(n));
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// parseInvocationHeads — T1.3 Phantom-API gate fuel
// ---------------------------------------------------------------------------

/**
 * Bare-identifier invocation heads only — the phantom-gate's high-precision
 * input. We DELIBERATELY skip `x.foo()` (member calls) because we can't
 * resolve `foo` via imports without type info, and flagging it would be a
 * false-positive factory.
 *
 *   `sym(`         → call_expression where `function` is an `identifier`
 *   `new Sym(`     → new_expression where `constructor` is an `identifier`
 *   `<Sym ...>`    → JSX (Tsx only) with capitalized leftmost identifier
 */
export function parseInvocationHeads(file: string, source: string): ParsedInvocationHead[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();
  const out: ParsedInvocationHead[] = [];
  const dedup = new Set<string>();
  const push = (name: string, line: number, kind: 'call' | 'new' | 'jsx') => {
    if (KEYWORDS.has(name)) return;
    const key = `${name}:${line}:${kind}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    out.push({ name, line, kind });
  };

  for (const n of root.findAll({ rule: { kind: 'call_expression' } })) {
    if (isInsideKind(n, IMPORT_KIND)) continue;
    const fn = getField(n, 'function');
    if (!fn) continue;
    // BARE identifiers only — member_expression callees are skipped on purpose
    // (see header). This is what keeps the phantom-gate precise.
    if (fn.kind() === 'identifier') {
      push(fn.text(), lineOf(n), 'call');
    }
  }

  for (const n of root.findAll({ rule: { kind: 'new_expression' } })) {
    if (isInsideKind(n, IMPORT_KIND)) continue;
    const ctor = getField(n, 'constructor');
    if (!ctor) continue;
    if (ctor.kind() === 'identifier') {
      push(ctor.text(), lineOf(n), 'new');
    }
  }

  // JSX is Tsx-only (the TS/JS grammars don't surface these kinds). Restrict to
  // capitalized leftmost identifiers — lowercase `<div>` etc. are HTML tags,
  // not user-land symbols.
  if (lang === Lang.Tsx) {
    for (const kind of ['jsx_opening_element', 'jsx_self_closing_element']) {
      for (const n of root.findAll({ rule: { kind } })) {
        if (isInsideKind(n, IMPORT_KIND)) continue;
        const nameNode = getField(n, 'name');
        const leftName = leftmostName(nameNode);
        if (!leftName) continue;
        if (/^[a-z]/.test(leftName)) continue;
        push(leftName, lineOf(n), 'jsx');
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

/**
 * Resolve import bindings — the names that, if used downstream, are NOT
 * unresolved (T1.3's phantom-gate uses this to decide "declared-or-imported
 * vs hallucinated").
 *
 * Covers:
 *   - default:   `import foo from 'x'`           → { name: 'foo' }
 *   - named:     `import { a, b as c } from 'x'` → { name: 'a' }, { name: 'c' }
 *   - namespace: `import * as ns from 'x'`       → { name: 'ns' }
 *   - type-only: `import type { T } from 'x'`    → isType: true for all bindings
 *   - per-spec:  `import { type T, b } from 'x'` → T isType:true, b isType:false
 *   - side-effect-only `import 'x'` is ignored (no bindings).
 */
export function parseImports(file: string, source: string): ParsedImport[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();
  const out: ParsedImport[] = [];

  for (const stmt of root.findAll({ rule: { kind: 'import_statement' } })) {
    const src = getField(stmt, 'source')?.text() ?? '';
    const sourceStr = src.replace(/^['"`]|['"`]$/g, '');
    const topTypeOnly = stmt.children().some((c) => c.kind() === 'type');

    for (const clause of childrenOfKind(stmt, 'import_clause')) {
      // Default binding: bare `identifier` direct child of import_clause.
      for (const c of clause.children()) {
        if (c.kind() === 'identifier') {
          out.push({ name: c.text(), source: sourceStr, isType: topTypeOnly });
        } else if (c.kind() === 'namespace_import') {
          const id = c.find({ rule: { kind: 'identifier' } });
          if (id) out.push({ name: id.text(), source: sourceStr, isType: topTypeOnly });
        } else if (c.kind() === 'named_imports') {
          for (const spec of childrenOfKind(c, 'import_specifier')) {
            const name = getField(spec, 'alias')?.text() ?? getField(spec, 'name')?.text();
            if (!name) continue;
            const specTypeOnly = spec.children().some((cc) => cc.kind() === 'type');
            out.push({ name, source: sourceStr, isType: topTypeOnly || specTypeOnly });
          }
        }
      }
    }
  }

  return out;
}
