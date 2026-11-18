/**
 * Parsed module facts — the data the dependency-graph core (`modules/repo-intel/
 * graph`) consumes and the ast-grep parser (`adapters/astgrep/module-facts.ts`)
 * produces. Lives in the domain ring so the pure core does not depend on the
 * parser adapter (SPEC-18, plan 19 phase-1 architecture review).
 */

export type ModuleImportKind = 'static' | 'dynamic' | 'require';

export interface ModuleImport {
  /** Local binding name; null for side-effect / unbound dynamic imports. */
  localName: string | null;
  /** Imported name: a name, `default`, `*` (namespace/whole module) or null (side-effect). */
  importedName: string | null;
  /** Literal specifier verbatim; null when non-literal (unresolvable). */
  specifier: string | null;
  /** `import type {…}`, `import { type X }`. */
  isType: boolean;
  kind: ModuleImportKind;
  /** Non-literal dynamic `import(x)` / `require(x)`: recorded, never resolvable. */
  nonLiteral: boolean;
  /** 1-based. */
  line: number;
}

export type ModuleExportKind = 'local' | 'default' | 'reexport' | 'reexport_all' | 'namespace';

export interface ModuleExport {
  /** Name seen by importers: a name, `default`, or `*` for `export *`. */
  exportedName: string;
  /**
   * `local`/`default`: the local declaration name (anonymous default => the
   * pseudo-symbol `default`); `reexport`: the name in the source module.
   */
  localName: string | null;
  kind: ModuleExportKind;
  /** Re-export source specifier (`reexport`, `reexport_all`, `namespace`). */
  specifier: string | null;
  isType: boolean;
  line: number;
}

/** One declaration (structurally the parser's `ParsedSymbol`). */
export interface ModuleSymbol {
  name: string;
  kind: string;
  /** 1-based. */
  line: number;
  /** 1-based line of the closing token. */
  endLine: number;
  exported: boolean;
  signature: string | null;
}

export type ModuleReferenceKind = 'call' | 'value' | 'type' | 'extends' | 'implements' | 'member';

export interface ModuleReference {
  kind: ModuleReferenceKind;
  /**
   * The referenced identifier. For qualified forms (`ns.fn`, `ns.T`,
   * `extends ns.Base`, `a.b.m`) it is the LAST segment and `receiver` carries
   * the qualifier text.
   */
  name: string;
  receiver: string | null;
  /** `member` only: the property name (same as `name`). */
  prop?: string;
  /** `member` only: the member is the callee of a call/new expression. */
  isCall?: boolean;
  /** 1-based. */
  line: number;
  /** Name of the tightest enclosing declaration, or `<module>`. */
  enclosing: string;
}

export interface ModuleFacts {
  imports: ModuleImport[];
  exports: ModuleExport[];
  symbols: ModuleSymbol[];
  references: ModuleReference[];
}

/** Module-scope pseudo-symbol (spans the whole file). */
export const MODULE_SYMBOL = '<module>';
/** Pseudo-symbol for an anonymous `export default <expr>`. */
export const DEFAULT_SYMBOL = 'default';
