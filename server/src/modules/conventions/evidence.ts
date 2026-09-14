/**
 * Evidence verification — the step that makes "every candidate has real
 * code" true by construction, not by model honesty. A raw candidate is
 * dropped (never reaches the DB) unless its cited file exists in the sample
 * set and its snippet is found verbatim (whitespace-normalized) in that file.
 *
 * Pure — no fs, no DB — so it's unit-testable against in-memory file content.
 */

export interface VerifiedLineRange {
  startLine: number;
  endLine: number;
}

/** Collapse internal whitespace and trim — tolerates re-indentation without
 *  tolerating a genuinely different line. */
function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** Drop wholly-blank lines at the start/end of a quoted snippet; keep any
 *  blank lines in the middle, since they still have to line up with the file. */
function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end);
}

/**
 * Find `snippet` as a contiguous, whitespace-normalized run of lines inside
 * `fileContent`. Returns the 1-indexed line range of the first match, or
 * `null` when the snippet doesn't appear — the caller drops the candidate.
 */
export function findSnippetLines(fileContent: string, snippet: string): VerifiedLineRange | null {
  const fileLines = fileContent.split(/\r?\n/);
  const snippetLines = trimBlankEdges(snippet.split(/\r?\n/));
  if (snippetLines.length === 0) return null;

  const normFile = fileLines.map(normalizeLine);
  const normSnippet = snippetLines.map(normalizeLine);

  for (let i = 0; i <= normFile.length - normSnippet.length; i++) {
    let matched = true;
    for (let j = 0; j < normSnippet.length; j++) {
      if (normFile[i + j] !== normSnippet[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return { startLine: i + 1, endLine: i + normSnippet.length };
  }
  return null;
}
