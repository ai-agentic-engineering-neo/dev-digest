/* PromptSearchModal helpers — literal, case-insensitive line filtering (never a RegExp, so
   `*`, `(` and friends in the query match themselves). */

/** Lines of `text` containing `q` (case-insensitive). Empty query → every line. */
export function matchLines(text: string, q: string): string[] {
  const lines = text.split("\n");
  if (q === "") return lines;
  const needle = q.toLowerCase();
  return lines.filter((line) => line.toLowerCase().includes(needle));
}

/** Split `line` into alternating plain / matching parts for highlighting (case-insensitive). */
export function highlightParts(line: string, q: string): { text: string; match: boolean }[] {
  if (q === "") return [{ text: line, match: false }];
  const hay = line.toLowerCase();
  const needle = q.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  let at = hay.indexOf(needle, from);
  while (at !== -1) {
    if (at > from) parts.push({ text: line.slice(from, at), match: false });
    parts.push({ text: line.slice(at, at + needle.length), match: true });
    from = at + needle.length;
    at = hay.indexOf(needle, from);
  }
  if (from < line.length) parts.push({ text: line.slice(from), match: false });
  return parts;
}
