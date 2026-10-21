import type { ContextAttachment, SpecFile } from "@devdigest/shared";

/** One row of the Context tab: a listed document (or a missing path) and whether it is attached. */
export interface ContextRow {
  path: string;
  file: SpecFile | null;
  attached: boolean;
  missing: boolean;
  tooLarge: boolean;
}

/**
 * Attached paths first, in stored order (a path that left the listing stays,
 * flagged missing, so it can be unchecked), then the other listed documents by path.
 */
export function mergeRows(files: SpecFile[], attachments: ContextAttachment[]): ContextRow[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const ordered = [...attachments].sort((a, b) => a.order - b.order);
  const attachedSet = new Set(ordered.map((a) => a.path));
  const attached: ContextRow[] = ordered.map((a) => {
    const file = byPath.get(a.path) ?? null;
    return { path: a.path, file, attached: true, missing: a.missing || !file, tooLarge: a.too_large || !!file?.too_large };
  });
  const rest: ContextRow[] = files
    .filter((f) => !attachedSet.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, file, attached: false, missing: false, tooLarge: !!file.too_large }));
  return [...attached, ...rest];
}

export function attachedPaths(rows: ContextRow[]): string[] {
  return rows.filter((r) => r.attached).map((r) => r.path);
}

/** Move `from` to `to` inside `paths`; out-of-range or no-op moves return the input. */
export function movePath(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) return paths;
  const next = [...paths];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Case-insensitive filter over path and kind. */
export function filterRows(rows: ContextRow[], query: string): ContextRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q) || (r.file?.kind ?? "").includes(q));
}
