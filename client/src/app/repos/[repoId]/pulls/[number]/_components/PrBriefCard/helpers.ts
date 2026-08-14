/** A `Risk.file_refs` entry's documented encoding (server/vendor/shared's
 *  `Risk.file_refs` doc comment): `"<path>"` or `"<path>:<line>"`, always
 *  server-constructed. Splits back into the two parts for rendering/linking —
 *  a trailing `:<digits>` is treated as the line; anything else (including a
 *  path that happens to contain a colon with a non-numeric tail) is left
 *  whole. */
export function splitFileRef(ref: string): { file: string; line: number | undefined } {
  const idx = ref.lastIndexOf(":");
  if (idx === -1) return { file: ref, line: undefined };
  const tail = ref.slice(idx + 1);
  if (!/^\d+$/.test(tail)) return { file: ref, line: undefined };
  return { file: ref.slice(0, idx), line: Number(tail) };
}
