/**
 * Evidence verification — what makes "every candidate cites real code" true
 * by construction, not by model honesty. Pure (no fs, no DB).
 */

export interface VerifiedLineRange {
  startLine: number;
  endLine: number;
}

/** Collapse internal whitespace and trim — tolerates re-indentation, not a different line. */
function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** Drop blank lines at the edges of a quoted snippet; inner blank lines must still line up. */
function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end);
}

/**
 * Find `snippet` as a contiguous, whitespace-normalised run of lines inside
 * `fileContent`. Returns the 1-indexed range of the first match, or `null`
 * when it doesn't appear — the caller drops the candidate.
 */
export function findSnippetLines(fileContent: string, snippet: string): VerifiedLineRange | null {
  const snippetLines = trimBlankEdges(snippet.split(/\r?\n/)).map(normalizeLine);
  if (snippetLines.length === 0) return null;
  const fileLines = fileContent.split(/\r?\n/).map(normalizeLine);

  for (let i = 0; i <= fileLines.length - snippetLines.length; i++) {
    let matched = true;
    for (let j = 0; j < snippetLines.length; j++) {
      if (fileLines[i + j] !== snippetLines[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return { startLine: i + 1, endLine: i + snippetLines.length };
  }
  return null;
}
