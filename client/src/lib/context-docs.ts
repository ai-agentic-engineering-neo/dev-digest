/* context-docs.ts — pure helpers for the Project Context page and the agent Context tab. */

/** Per-run cap on attached docs, in estimated tokens (mirrors server CONTEXT_TOKEN_CAP). */
export const CONTEXT_TOKEN_CAP = 4000;

/** Case-insensitive match on a doc's file name OR its folder path; "" keeps every doc. */
export function filterDocs<T extends { path: string }>(docs: readonly T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...docs];
  return docs.filter((d) => {
    const p = d.path.toLowerCase();
    const cut = p.lastIndexOf("/");
    const name = p.slice(cut + 1);
    const folder = cut >= 0 ? p.slice(0, cut) : "";
    return name.includes(q) || folder.includes(q);
  });
}

/**
 * Shorten a path to at most `max` chars, always keeping the file name: leading folders are kept
 * while they fit and the middle is replaced by "…/" (`server/…/deep/a.md`).
 */
export function shortenPath(path: string, max: number): string {
  if (path.length <= max) return path;
  const segments = path.split("/");
  const basename = segments.pop() ?? path;
  const tail = `…/${basename}`;
  if (tail.length >= max || segments.length === 0) return tail;
  let head = "";
  for (const seg of segments) {
    const next = `${head}${seg}/`;
    if (next.length + tail.length > max) break;
    head = next;
  }
  return `${head}${tail}`;
}

/** Sum of known token estimates (a missing doc counts 0). */
export function sumTokens(docs: readonly { tokens: number | null }[]): number {
  return docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
}
