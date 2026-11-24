/**
 * React keys from item identities instead of array positions. The first
 * occurrence of a base keeps it as-is; repeats get `base#1`, `base#2`, … so
 * equal items still produce unique keys (a duplicate key is worse than an index).
 */
export function dedupeKeys(bases: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return bases.map((b) => {
    const n = seen.get(b) ?? 0;
    seen.set(b, n + 1);
    return n === 0 ? b : `${b}#${n}`;
  });
}
