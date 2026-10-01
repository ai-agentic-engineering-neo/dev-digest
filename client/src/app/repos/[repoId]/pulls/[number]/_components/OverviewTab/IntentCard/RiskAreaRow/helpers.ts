/** `file` or `file:line` when the model grounded a line. */
export function fileLine(file: string, line: number | null): string {
  return line != null ? `${file}:${line}` : file;
}
