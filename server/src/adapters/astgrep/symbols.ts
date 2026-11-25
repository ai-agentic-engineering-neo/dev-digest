import { parse, type SgNode } from '@ast-grep/napi';

import { MAX_SIGNATURE_CHARS } from '../code-scope.js';
import { KEYWORDS, childrenOfKind, endLineOf, getField, headSignature, lineOf } from './ast-helpers.js';
import { langForFile } from './lang.js';
import type { ParsedSymbol } from './types.js';

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

  return dedupe(out);
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

function dedupe(syms: ParsedSymbol[]): ParsedSymbol[] {
  const seen = new Map<string, ParsedSymbol>();
  for (const s of syms) {
    const key = `${s.name}:${s.kind}:${s.line}`;
    const prior = seen.get(key);
    // keep the most-exported version; first-seen for everything else
    if (!prior) seen.set(key, s);
    else if (s.exported && !prior.exported) seen.set(key, s);
  }
  return [...seen.values()];
}
