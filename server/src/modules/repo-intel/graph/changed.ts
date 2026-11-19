/**
 * Which symbols does a PR change? (plan 19 / P2-B; AC-25, AC-26). Pure.
 *
 * Two coordinate systems meet here and must never be mixed:
 *   - head-side ranges (added lines) are matched against the HEAD declarations
 *     (parsed by the overlay) — never against the persisted base rows;
 *   - base-side ranges (removed lines) are matched against the PERSISTED
 *     declarations. A persisted symbol that a removed line touches is `deleted`
 *     only when the head file no longer declares that name; otherwise it was
 *     merely edited and is `changed`.
 */
import { MODULE_SYMBOL } from '../../../domain/module-facts.js';
import { parsePatchRanges, rangesIntersect, type LineRange } from './hunks.js';

/** Structural subset of a declaration (persisted row or freshly parsed head symbol). */
export interface DeclRange {
  name: string;
  kind: string;
  line: number;
  endLine: number;
}

export interface ChangedFileInput {
  path: string;
  /** GitHub file status: `added|removed|modified|renamed|copied|changed|unchanged`. */
  status?: string | null;
  previousPath?: string | null;
  /** Unified diff of this file; null/absent/empty ⇒ whole file counts as changed (legacy path). */
  patch?: string | null;
}

export interface ChangedSymbol {
  path: string;
  name: string;
  kind: string;
  /** Removed by the PR (file deleted, symbol deleted/moved away, renamed-from). */
  deleted: boolean;
}

export interface ChangedInput {
  files: ChangedFileInput[];
  /** Persisted (base-index) declarations by path. */
  base: ReadonlyMap<string, readonly DeclRange[]>;
  /**
   * Head declarations by path for every file the overlay parsed. A path that is
   * ABSENT here is "head unknown" (degraded / unsupported): only base data is used.
   */
  head: ReadonlyMap<string, readonly DeclRange[]>;
}

const isRemoved = (status: string | null | undefined): boolean => status === 'removed' || status === 'deleted';

/** v1 stored `Class.method` twice (qualified + bare, same span); only the qualified row is a graph key. */
function graphKeys<T extends DeclRange>(decls: readonly T[]): T[] {
  return decls.filter((d) => !(d.kind === 'method' && !d.name.includes('.')));
}

const contains = (outer: DeclRange, inner: DeclRange): boolean =>
  outer !== inner &&
  outer.line <= inner.line &&
  outer.endLine >= inner.endLine &&
  (outer.line < inner.line || outer.endLine > inner.endLine);

/** Tightest declarations intersecting `range`; null ⇒ none (module scope). */
function leaves<T extends DeclRange>(decls: readonly T[], range: LineRange): T[] | null {
  const hit = decls.filter(
    (d) => d.name !== MODULE_SYMBOL && rangesIntersect({ start: d.line, end: d.endLine }, range),
  );
  const tight = hit.filter((d) => !hit.some((o) => contains(d, o)));
  return tight.length > 0 ? tight : null;
}

export function computeChangedSymbols(input: ChangedInput): ChangedSymbol[] {
  const out = new Map<string, ChangedSymbol>();
  const add = (path: string, name: string, kind: string, deleted: boolean): void => {
    const key = `${path}\0${name}`;
    const prev = out.get(key);
    // A name flagged both ways in one PR (e.g. remove + re-add elsewhere in the file) is simply changed.
    if (prev && prev.deleted !== deleted) {
      out.set(key, { path, name, kind, deleted: false });
      return;
    }
    out.set(key, { path, name, kind, deleted });
  };
  const moduleKind = 'module';

  for (const file of input.files) {
    const baseDecls = graphKeys(input.base.get(file.path) ?? []);
    const headDecls = input.head.get(file.path);

    if (isRemoved(file.status)) {
      for (const d of baseDecls) add(file.path, d.name, d.kind, true);
      continue;
    }

    if (file.status === 'renamed' && file.previousPath && file.previousPath !== file.path) {
      for (const d of graphKeys(input.base.get(file.previousPath) ?? [])) add(file.previousPath, d.name, d.kind, true);
      // New path: everything the head declares is new (head unknown ⇒ nothing to add).
      if (headDecls) for (const d of headDecls) add(file.path, d.name, d.kind, false);
      // A pure rename (no patch) has nothing else to compute; a rename WITH edits is covered above too,
      // since every head symbol of the new path is already "added".
      continue;
    }

    const ranges = parsePatchRanges(file.patch);
    const hasRanges = ranges.added.length > 0 || ranges.removed.length > 0;

    if (!hasRanges && file.status !== 'added') {
      // Legacy / no-diff path: the whole file counts as changed.
      for (const d of baseDecls) add(file.path, d.name, d.kind, false);
      if (headDecls) {
        const known = new Set(baseDecls.map((d) => d.name));
        for (const d of headDecls) if (!known.has(d.name)) add(file.path, d.name, d.kind, false);
      }
      continue;
    }

    const headNames = headDecls ? new Set(headDecls.map((d) => d.name)) : null;

    // ---- head side ----
    if (headDecls) {
      if (file.status === 'added') {
        for (const d of headDecls) add(file.path, d.name, d.kind, false);
      } else {
        for (const r of ranges.added) {
          const hit = leaves(headDecls, r);
          if (hit) for (const d of hit) add(file.path, d.name, d.kind, false);
          else add(file.path, MODULE_SYMBOL, moduleKind, false);
        }
        // Declared in head but unknown to the (possibly stale) index ⇒ added.
        const known = new Set(baseDecls.map((d) => d.name));
        if (baseDecls.length > 0) {
          for (const d of headDecls) if (d.name !== MODULE_SYMBOL && !known.has(d.name)) add(file.path, d.name, d.kind, false);
        }
      }
    }

    // ---- base side ----
    for (const r of ranges.removed) {
      const hit = leaves(baseDecls, r);
      if (!hit) {
        add(file.path, MODULE_SYMBOL, moduleKind, false);
        continue;
      }
      for (const d of hit) {
        // Head known and no longer declaring the name ⇒ deleted; otherwise edited.
        const gone = headNames !== null && !headNames.has(d.name);
        add(file.path, d.name, d.kind, gone);
      }
    }
  }
  return [...out.values()].sort((a, b) => (a.path === b.path ? (a.name < b.name ? -1 : 1) : a.path < b.path ? -1 : 1));
}
