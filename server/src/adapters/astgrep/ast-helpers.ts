/** Shared tree-sitter node helpers for the ast-grep extractors. */
import type { SgNode } from '@ast-grep/napi';

import { MAX_SIGNATURE_CHARS } from '../code-scope.js';

/** 0-based ast-grep line → 1-based file line (matches extract.ts). */
export function lineOf(n: SgNode): number {
  return n.range().start.line + 1;
}

export function endLineOf(n: SgNode): number {
  return n.range().end.line + 1;
}

/**
 * Return the declaration head as a single-line, length-bounded signature.
 * Strategy: take node text up to the body's start (when a body field exists),
 * otherwise use the whole text. Collapse whitespace, drop trailing punctuation
 * that's part of the head/body boundary, then trim to MAX_SIGNATURE_CHARS.
 */
export function headSignature(n: SgNode): string {
  const range = n.range();
  const fullText = n.text();
  let head = fullText;

  // `.field('body')` is typed against the language's static map; cast away the
  // strictness — at runtime it accepts any field name and returns SgNode|null.
  const body = (n as unknown as { field(name: string): SgNode | null }).field('body');
  if (body) {
    const offset = body.range().start.index - range.start.index;
    if (offset > 0 && offset <= fullText.length) head = fullText.slice(0, offset);
  }

  head = head.replace(/\s+/g, ' ').trim();
  // Strip a trailing `{`, `=`, or `=>` that comes from the body boundary.
  head = head.replace(/(?:\s*=>|\s*\{|\s*=)\s*$/, '').trim();

  if (head.length > MAX_SIGNATURE_CHARS) {
    head = head.slice(0, MAX_SIGNATURE_CHARS - 1) + '…';
  }
  return head;
}

/** JS keywords / common no-symbol identifiers — parity with extract.ts. */
export const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'await', 'typeof',
  'new', 'delete', 'void', 'do', 'else', 'in', 'of', 'instanceof', 'yield', 'super',
  'constructor', 'get', 'set', 'import', 'export', 'as', 'from', 'class', 'extends',
]);

/** Leftmost identifier in a name node (`identifier` or `member_expression`). */
export function leftmostName(n: SgNode | null | undefined): string | null {
  if (!n) return null;
  if (n.kind() === 'identifier' || n.kind() === 'type_identifier') return n.text();
  if (n.kind() === 'member_expression') {
    const obj = (n as unknown as { field(name: string): SgNode | null }).field('object');
    return leftmostName(obj);
  }
  return null;
}

/** Rightmost identifier in a member expression (= the method/property name). */
export function rightmostName(n: SgNode | null | undefined): string | null {
  if (!n) return null;
  if (n.kind() === 'identifier' || n.kind() === 'type_identifier') return n.text();
  if (n.kind() === 'property_identifier') return n.text();
  if (n.kind() === 'member_expression') {
    const prop = (n as unknown as { field(name: string): SgNode | null }).field('property');
    return prop?.text() ?? null;
  }
  return null;
}

/** Children iterator with a kind filter. */
export function childrenOfKind(n: SgNode, kind: string): SgNode[] {
  return n.children().filter((c) => c.kind() === kind);
}

/** True when `n` (or any of its ancestors before reaching root) is an import. */
export function isInsideImport(n: SgNode): boolean {
  for (const a of n.ancestors()) if (a.kind() === 'import_statement') return true;
  return false;
}

export function getField(n: SgNode, name: string): SgNode | null {
  return (n as unknown as { field(name: string): SgNode | null }).field(name);
}
